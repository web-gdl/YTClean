import { useEffect, useState } from 'react';
import { applyTheme, type Theme } from '../app/theme';
import { S } from '../app/strings';
import { ExternalLink } from '../components/Link';
import { normalizeInstanceUrl } from '../data/http';
import { LocalClient, type LocalStatus } from '../data/providers/local';
import { createProvider } from '../data/registry';
import { toProviderError, type ProviderId } from '../data/types';
import { clearAll } from '../storage/localStore';
import { favorites, watchHistory } from '../storage/collections';
import { DEFAULT_SETTINGS, resetSettings, updateSettings, useSettings } from '../storage/settings';

const PLAYER_LANGUAGES: [string, string][] = [
  ['es', 'Español'],
  ['en', 'English'],
  ['pt', 'Português'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['it', 'Italiano'],
  ['ca', 'Català'],
  ['eu', 'Euskara'],
  ['gl', 'Galego'],
];

export function SettingsPage() {
  const settings = useSettings();
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<{ status: 'idle' | 'running' | 'ok' | 'error'; message?: string }>({ status: 'idle' });
  const [cleared, setCleared] = useState(false);
  const [instanceError, setInstanceError] = useState('');
  const [localStatus, setLocalStatus] = useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; data?: LocalStatus; message?: string }>({ status: 'idle' });
  const [localUrlError, setLocalUrlError] = useState('');
  const usesLocal = settings.provider === 'local' || settings.playerMode === 'local';

  // Estado del servicio local, solo cuando el usuario lo ha activado.
  useEffect(() => {
    if (!usesLocal) return;
    const controller = new AbortController();
    const client = new LocalClient(settings.localServiceUrl);
    client.status({ signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) setLocalStatus({ status: 'ok', data });
      },
      (e: unknown) => {
        if (!controller.signal.aborted) setLocalStatus({ status: 'error', message: toProviderError(e).message });
      },
    );
    return () => {
      controller.abort();
    };
  }, [usesLocal, settings.localServiceUrl]);

  const setLocalUrl = (raw: string) => {
    const value = raw.trim().replace(/\/+$/, '');
    if (value === '') {
      updateSettings({ localServiceUrl: '' });
      setLocalUrlError('');
      return;
    }
    if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(value)) {
      setLocalUrlError('Debe ser una dirección local: http://127.0.0.1:8787');
      return;
    }
    setLocalUrlError('');
    updateSettings({ localServiceUrl: value });
  };

  const clearLocalCache = async () => {
    if (!window.confirm(S.saved.confirmClear)) return;
    try {
      await new LocalClient(settings.localServiceUrl).cacheRemove();
      setLocalStatus((prev) => (prev.data ? { ...prev, data: { ...prev.data, cache: { ...prev.data.cache, files: 0, bytes: 0 } } } : prev));
    } catch {
      /* se muestra el estado anterior */
    }
  };

  const setProvider = (provider: ProviderId) => {
    updateSettings({ provider });
    setTest({ status: 'idle' });
  };

  const setInstance = (key: 'invidiousInstance' | 'pipedInstance', raw: string) => {
    if (raw.trim() === '') {
      updateSettings({ [key]: '' });
      setInstanceError('');
      return;
    }
    const normalized = normalizeInstanceUrl(raw);
    if (!normalized) {
      setInstanceError(S.settings.instanceInvalid);
      return;
    }
    setInstanceError('');
    setTest({ status: 'idle' });
    updateSettings({ [key]: normalized });
  };

  const runTest = async () => {
    const provider = createProvider(settings);
    if (!provider) {
      setTest({ status: 'error', message: S.status.errors['not-configured'] ?? '' });
      return;
    }
    setTest({ status: 'running' });
    try {
      const page = await provider.searchVideos('me at the zoo');
      setTest({ status: 'ok', message: `${S.settings.testOk} (${page.items.length} resultados)` });
    } catch (e) {
      const err = toProviderError(e);
      setTest({ status: 'error', message: `${S.status.errors[err.code] ?? err.message}${err.status ? ` (HTTP ${err.status})` : ''}` });
    }
  };

  const clearEverything = () => {
    if (!window.confirm(S.saved.confirmClear)) return;
    favorites.clear();
    watchHistory.clear();
    resetSettings();
    clearAll();
    applyTheme(DEFAULT_SETTINGS.theme);
    setCleared(true);
  };

  return (
    <div className="page page--settings">
      <h1 className="page__title">{S.settings.title}</h1>
      <p className="muted">{S.settings.intro}</p>

      <section className="panel">
        <h2 className="panel__title">{S.settings.providerSection}</h2>
        <p className="muted">{S.settings.providerIntro}</p>
        <fieldset className="choices">
          <legend className="visually-hidden">{S.settings.providerSection}</legend>
          <ProviderOption id="none" current={settings.provider} label={S.settings.provider.none} note={S.settings.provider.noneNote} onSelect={setProvider} />
          <ProviderOption id="youtube-data-api" current={settings.provider} label={S.settings.provider.youtube} note={S.settings.provider.youtubeNote} onSelect={setProvider} />
          <ProviderOption id="invidious" current={settings.provider} label={S.settings.provider.invidious} note={S.settings.provider.invidiousNote} onSelect={setProvider} />
          <ProviderOption id="piped" current={settings.provider} label={S.settings.provider.piped} note={S.settings.provider.pipedNote} onSelect={setProvider} />
          <ProviderOption id="local" current={settings.provider} label={S.settings.provider.local} note={S.settings.provider.localNote} onSelect={setProvider} />
        </fieldset>

        {settings.provider === 'youtube-data-api' ? (
          <div className="field">
            <label htmlFor="api-key">{S.settings.apiKey}</label>
            <div className="field__row">
              <input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={settings.youtubeApiKey}
                onChange={(e) => updateSettings({ youtubeApiKey: e.target.value.trim() })}
                autoComplete="new-password"
                spellCheck={false}
                className="input"
              />
              <button type="button" className="button button--small" onClick={() => setShowKey((v) => !v)} aria-pressed={showKey}>
                {showKey ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            <p className="muted small">
              {S.settings.apiKeyHelp}{' '}
              <ExternalLink href="https://console.cloud.google.com/apis/library/youtube.googleapis.com">{S.settings.apiKeyLinkConsole}</ExternalLink>
              {' · '}
              <ExternalLink href="https://developers.google.com/youtube/v3/getting-started">{S.settings.apiKeyLinkDocs}</ExternalLink>
            </p>
          </div>
        ) : null}

        {settings.provider === 'invidious' ? (
          <div className="field">
            <label htmlFor="invidious-url">{S.settings.instanceUrl}</label>
            <input
              id="invidious-url"
              type="url"
              className="input"
              defaultValue={settings.invidiousInstance}
              onBlur={(e) => setInstance('invidiousInstance', e.target.value)}
              placeholder="https://"
              autoComplete="off"
              spellCheck={false}
            />
            {instanceError ? <p className="status status--error small">{instanceError}</p> : null}
            <p className="muted small">
              {S.settings.instanceHelpInvidious} <ExternalLink href="https://api.invidious.io/">{S.settings.instanceLinkInvidious}</ExternalLink>
            </p>
          </div>
        ) : null}

        {settings.provider === 'piped' ? (
          <div className="field">
            <label htmlFor="piped-url">{S.settings.instanceUrl}</label>
            <input
              id="piped-url"
              type="url"
              className="input"
              defaultValue={settings.pipedInstance}
              onBlur={(e) => setInstance('pipedInstance', e.target.value)}
              placeholder="https://"
              autoComplete="off"
              spellCheck={false}
            />
            {instanceError ? <p className="status status--error small">{instanceError}</p> : null}
            <p className="muted small">
              {S.settings.instanceHelpPiped} <ExternalLink href="https://github.com/TeamPiped/Piped/wiki/Instances">{S.settings.instanceLinkPiped}</ExternalLink>
            </p>
          </div>
        ) : null}

        {usesLocal ? (
          <div className="field">
            <label htmlFor="local-url">{S.settings.localUrl}</label>
            <input
              id="local-url"
              type="text"
              inputMode="url"
              className="input"
              defaultValue={settings.localServiceUrl}
              onBlur={(e) => setLocalUrl(e.target.value)}
              placeholder="(mismo origen)"
              autoComplete="off"
              spellCheck={false}
            />
            {localUrlError ? <p className="status status--error small">{localUrlError}</p> : null}
            <p className="muted small">{S.settings.localUrlHelp}</p>
            {localStatus.status === 'ok' && localStatus.data ? (
              <p className="status status--ok small" role="status">
                Servicio local {localStatus.data.service} · yt-dlp {localStatus.data.ytdlp ?? 'no encontrado'} · ffmpeg {localStatus.data.ffmpeg ? 'sí' : 'no'} · runtime JS {localStatus.data.jsRuntime} · {S.local.cache}:{' '}
                {S.local.cacheSize(localStatus.data.cache.files, `${Math.round(localStatus.data.cache.bytes / 1_000_000)} MB`)}{' '}
                {localStatus.data.cache.files > 0 ? (
                  <button type="button" className="link-button" onClick={() => void clearLocalCache()}>
                    {S.local.cacheClear}
                  </button>
                ) : null}
              </p>
            ) : null}
            {localStatus.status === 'error' ? (
              <p className="status status--error small" role="alert">
                El servicio local no responde: {localStatus.message} — ejecuta <code>npm run local</code> y abre la web desde él.
              </p>
            ) : null}
          </div>
        ) : null}

        {settings.provider !== 'none' ? (
          <div className="field">
            <button type="button" className="button" onClick={() => void runTest()} disabled={test.status === 'running'}>
              {test.status === 'running' ? S.settings.testing : S.settings.testProvider}
            </button>
            {settings.provider === 'youtube-data-api' ? <span className="muted small"> La prueba es una búsqueda (101 unidades de cuota).</span> : null}
            {test.status === 'ok' ? (
              <p className="status status--ok" role="status">
                {test.message}
              </p>
            ) : null}
            {test.status === 'error' ? (
              <p className="status status--error" role="alert">
                {test.message}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2 className="panel__title">{S.settings.appearanceSection}</h2>
        <fieldset className="choices choices--inline">
          <legend>{S.settings.theme}</legend>
          {(
            [
              ['system', S.settings.themeSystem],
              ['light', S.settings.themeLight],
              ['dark', S.settings.themeDark],
            ] as [Theme, string][]
          ).map(([value, label]) => (
            <label key={value} className="choice">
              <input
                type="radio"
                name="theme"
                value={value}
                checked={settings.theme === value}
                onChange={() => {
                  updateSettings({ theme: value });
                  applyTheme(value);
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset className="choices choices--inline">
          <legend>{S.settings.thumbnails}</legend>
          {(
            [
              ['show', S.settings.thumbnailsShow],
              ['hide', S.settings.thumbnailsHide],
            ] as ['show' | 'hide', string][]
          ).map(([value, label]) => (
            <label key={value} className="choice">
              <input type="radio" name="thumbnails" value={value} checked={settings.thumbnails === value} onChange={() => updateSettings({ thumbnails: value })} />
              {label}
            </label>
          ))}
        </fieldset>
        <p className="muted small">{S.settings.thumbnailsHelp}</p>
      </section>

      <section className="panel">
        <h2 className="panel__title">{S.settings.playerSection}</h2>
        <fieldset className="choices">
          <legend>{S.settings.playerMode}</legend>
          {(
            [
              ['official', S.settings.playerOfficial, S.settings.playerOfficialNote],
              ['local', S.settings.playerLocal, S.settings.playerLocalNote],
            ] as ['official' | 'local', string, string][]
          ).map(([value, label, note]) => (
            <label key={value} className={settings.playerMode === value ? 'choice choice--block choice--selected' : 'choice choice--block'}>
              <input type="radio" name="playerMode" value={value} checked={settings.playerMode === value} onChange={() => updateSettings({ playerMode: value })} />
              <span>
                <strong>{label}</strong>
                <span className="choice__note">{note}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="choice">
          <input type="checkbox" checked={settings.captions} onChange={(e) => updateSettings({ captions: e.target.checked })} />
          {S.settings.captions}
        </label>
        <div className="field">
          <label htmlFor="player-language">{S.settings.uiLanguage}</label>
          <select id="player-language" className="input" value={settings.playerLanguage} onChange={(e) => updateSettings({ playerLanguage: e.target.value })}>
            {PLAYER_LANGUAGES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <p className="muted small">{S.video.captionsHint}</p>
      </section>

      <section className="panel">
        <h2 className="panel__title">{S.settings.dataSection}</h2>
        <label className="choice">
          <input type="checkbox" checked={settings.keepHistory} onChange={(e) => updateSettings({ keepHistory: e.target.checked })} />
          {S.settings.history}
        </label>
        <p className="muted small">{S.settings.historyHelp}</p>
        <div className="field">
          <button type="button" className="button button--danger" onClick={clearEverything}>
            {S.settings.clearAll}
          </button>
          <p className="muted small">{S.settings.clearAllHelp}</p>
          {cleared ? (
            <p className="status status--ok" role="status">
              {S.settings.cleared}
            </p>
          ) : null}
        </div>
      </section>
      <p className="muted small">{S.settings.saveNote}</p>
    </div>
  );
}

function ProviderOption({
  id,
  current,
  label,
  note,
  onSelect,
}: {
  id: ProviderId;
  current: ProviderId;
  label: string;
  note: string;
  onSelect: (id: ProviderId) => void;
}) {
  return (
    <label className={current === id ? 'choice choice--block choice--selected' : 'choice choice--block'}>
      <input type="radio" name="provider" value={id} checked={current === id} onChange={() => onSelect(id)} />
      <span>
        <strong>{label}</strong>
        <span className="choice__note">{note}</span>
      </span>
    </label>
  );
}
