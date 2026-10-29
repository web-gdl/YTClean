// Acceso a localStorage con espacio de nombres propio y tolerancia a fallos
// (modo privado, almacenamiento bloqueado, cuota llena). Nada fuera de este
// módulo toca localStorage directamente.
export const PREFIX = 'yc:';

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const s = storage();
  if (!s) return fallback;
  try {
    const raw = s.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(PREFIX + key);
  } catch {
    /* sin acceso al almacenamiento */
  }
}

/** Claves propias presentes (sin prefijo). */
export function ownKeys(): string[] {
  const s = storage();
  if (!s) return [];
  const keys: string[] = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length));
    }
  } catch {
    /* ignorar */
  }
  return keys;
}

/** Borra todo lo que la aplicación guardó en este origen. */
export function clearAll(): void {
  for (const k of ownKeys()) remove(k);
  try {
    window.sessionStorage.clear();
  } catch {
    /* ignorar */
  }
}

/** Pequeño almacén observable sobre una clave, para hooks de React. */
export function createStore<T>(key: string, defaults: T, options: { persistDefaults?: boolean } = {}) {
  let value: T = { ...defaults, ...readJson<Partial<T>>(key, {}) };
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((l) => l());

  if (typeof window !== 'undefined') {
    // Cambios desde otra pestaña del mismo origen.
    window.addEventListener('storage', (e) => {
      if (e.key === PREFIX + key || e.key === null) {
        value = { ...defaults, ...readJson<Partial<T>>(key, {}) };
        notify();
      }
    });
  }

  return {
    get: () => value,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    /** Actualiza y persiste. Solo escribe en el almacenamiento cuando algo cambia. */
    update: (patch: Partial<T>) => {
      const next = { ...value, ...patch };
      if (shallowEqual(next, value)) return;
      value = next;
      if (options.persistDefaults || !shallowEqual(next, defaults)) writeJson(key, next);
      else remove(key);
      notify();
    },
    reset: () => {
      value = { ...defaults };
      remove(key);
      notify();
    },
  };
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra);
  const kb = Object.keys(rb);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is(ra[k], rb[k]));
}
