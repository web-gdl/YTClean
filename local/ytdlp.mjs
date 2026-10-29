// Ejecución controlada de yt-dlp: cola de procesos, tiempos máximos, JSON y
// descargas con progreso. yt-dlp es el único componente que habla con YouTube.
import { spawn } from 'node:child_process';
import { parseProgressLine } from './extract.mjs';

export class YtDlpError extends Error {
  constructor(message, { code = 'ytdlp', exitCode, stderr } = {}) {
    super(message);
    this.name = 'YtDlpError';
    this.code = code;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

/** Traduce los mensajes de error más habituales de yt-dlp a códigos de la app. */
export function classifyStderr(stderr) {
  const s = stderr || '';
  if (/Private video|This video is private/i.test(s)) return { code: 'private', message: 'El vídeo es privado.' };
  if (/Video unavailable|This video is not available|has been removed|does not exist|Incomplete YouTube ID/i.test(s)) return { code: 'not-found', message: 'El vídeo no está disponible.' };
  if (/Sign in to confirm your age|age-restricted|inappropriate for some users/i.test(s)) return { code: 'age-restricted', message: 'Vídeo con restricción de edad: YouTube exige iniciar sesión.' };
  if (/Unable to connect to proxy|Tunnel connection failed|ProxyError|Connection refused|Name or service not known|Network is unreachable|Temporary failure in name resolution|timed out|Unable to download webpage/i.test(s)) {
    return { code: 'network', message: 'Sin conexión con YouTube (red o proxy).' };
  }
  if (/Sign in to confirm you.re not a bot|HTTP Error 403|403 Forbidden/i.test(s)) return { code: 'blocked', message: 'YouTube ha rechazado la petición (403 / comprobación de bot). Actualiza yt-dlp o inténtalo más tarde.' };
  if (/is a live event|live stream|This live event/i.test(s)) return { code: 'live', message: 'Los directos no se admiten en el modo local.' };
  if (/No supported JavaScript runtime|js-runtimes|EJS|challenge/i.test(s)) return { code: 'runtime', message: 'yt-dlp necesita un runtime JavaScript (Deno o Node) y los scripts yt-dlp-ejs.' };
  if (/Requested format is not available/i.test(s)) return { code: 'no-format', message: 'No hay un formato compatible para esa calidad.' };
  return { code: 'ytdlp', message: 'yt-dlp falló.' };
}

export class YtDlp {
  /**
   * @param {{ bin?: string, jsRuntime?: string, concurrency?: number, timeoutMs?: number, extraArgs?: string[] }} [opts]
   */
  constructor(opts = {}) {
    this.bin = opts.bin ?? process.env.YC_YTDLP ?? 'yt-dlp';
    this.extraArgs = opts.extraArgs ?? [];
    this.concurrency = opts.concurrency ?? 2;
    this.timeoutMs = opts.timeoutMs ?? 90_000;
    this.jsRuntime = opts.jsRuntime; // p. ej. "node:/ruta/node" o undefined
    this.running = 0;
    this.queue = [];
  }

  baseArgs() {
    const args = ['--no-warnings', '--no-colors', ...this.extraArgs];
    if (this.jsRuntime) args.push('--js-runtimes', this.jsRuntime);
    return args;
  }

  /** Ejecuta cuando hay hueco en la cola. */
  schedule(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.pump();
    });
  }

  pump() {
    while (this.running < this.concurrency && this.queue.length) {
      const { task, resolve, reject } = this.queue.shift();
      this.running++;
      task().then(resolve, reject).finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  /**
   * Ejecuta yt-dlp y devuelve { code, stdout, stderr }.
   * @param {string[]} args
   * @param {{ timeoutMs?: number, onStdoutLine?: (line: string) => void, signal?: AbortSignal }} [opts]
   */
  run(args, opts = {}) {
    return this.schedule(
      () =>
        new Promise((resolve, reject) => {
          const child = spawn(this.bin, [...this.baseArgs(), ...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
          let stdout = '';
          let stderr = '';
          let partial = '';
          const timeout = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new YtDlpError('yt-dlp tardó demasiado', { code: 'timeout' }));
          }, opts.timeoutMs ?? this.timeoutMs);
          const onAbort = () => {
            child.kill('SIGKILL');
            reject(new YtDlpError('Cancelado', { code: 'aborted' }));
          };
          opts.signal?.addEventListener('abort', onAbort, { once: true });
          child.stdout.setEncoding('utf8');
          child.stderr.setEncoding('utf8');
          child.stdout.on('data', (chunk) => {
            if (opts.onStdoutLine) {
              partial += chunk;
              const lines = partial.split('\n');
              partial = lines.pop() ?? '';
              for (const line of lines) opts.onStdoutLine(line);
            } else {
              stdout += chunk;
            }
          });
          child.stderr.on('data', (chunk) => {
            stderr += chunk;
            if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
          });
          child.on('error', (err) => {
            clearTimeout(timeout);
            opts.signal?.removeEventListener('abort', onAbort);
            reject(new YtDlpError(`No se pudo ejecutar ${this.bin}: ${err.message}`, { code: 'missing' }));
          });
          child.on('close', (code) => {
            clearTimeout(timeout);
            opts.signal?.removeEventListener('abort', onAbort);
            if (opts.onStdoutLine && partial) opts.onStdoutLine(partial);
            resolve({ code: code ?? -1, stdout, stderr });
          });
        }),
    );
  }

  /** yt-dlp -J … → objeto. Lanza YtDlpError clasificado si falla. */
  async json(args, opts = {}) {
    const { code, stdout, stderr } = await this.run(['-J', ...args], opts);
    if (code !== 0 || !stdout.trim()) {
      const c = classifyStderr(stderr);
      throw new YtDlpError(c.message, { code: c.code, exitCode: code, stderr: stderr.slice(-2000) });
    }
    try {
      return JSON.parse(stdout);
    } catch {
      throw new YtDlpError('yt-dlp devolvió un JSON no válido', { code: 'bad-response', stderr: stderr.slice(-2000) });
    }
  }

  async version() {
    try {
      const { code, stdout } = await this.run(['--version'], { timeoutMs: 20_000 });
      return code === 0 ? stdout.trim() : null;
    } catch {
      return null;
    }
  }

  /**
   * Descarga con progreso. onProgress recibe los objetos de parseProgressLine.
   * @param {string[]} args argumentos (formato, salida, URL)
   */
  async download(args, onProgress, opts = {}) {
    const lines = [];
    const { code, stderr } = await this.run(
      ['--newline', '--progress', '--progress-template', 'download:yc-progress %(progress)j', ...args],
      {
        ...opts,
        timeoutMs: opts.timeoutMs ?? 3_600_000,
        onStdoutLine: (line) => {
          const p = parseProgressLine(line);
          if (p) onProgress(p);
          else if (lines.length < 200) lines.push(line);
        },
      },
    );
    if (code !== 0) {
      const c = classifyStderr(stderr);
      throw new YtDlpError(c.message, { code: c.code, exitCode: code, stderr: stderr.slice(-2000) });
    }
    return lines;
  }
}
