import { useState, type SubmitEvent } from 'react';
import { navigate, routes } from '../app/router';
import { S } from '../app/strings';
import { parseYouTubeInput } from '../data/util';
import { getSettings } from '../storage/settings';

interface Props {
  initialQuery?: string | undefined;
  autoFocus?: boolean;
  compact?: boolean;
}

/**
 * Cuadro de búsqueda. Solo busca al enviar (Intro o botón): nunca mientras se
 * escribe. Si el texto es un enlace o ID de YouTube, abre directamente el
 * vídeo, la lista o el canal sin consultar ninguna fuente de datos.
 */
export function SearchBox({ initialQuery = '', autoFocus = false, compact = false }: Props) {
  const [value, setValue] = useState(initialQuery);

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    const parsed = parseYouTubeInput(q);
    if (parsed) {
      switch (parsed.kind) {
        case 'video':
          navigate(routes.watch(parsed.id, { ...(parsed.start ? { start: parsed.start } : {}), ...(parsed.list ? { list: parsed.list } : {}) }));
          return;
        case 'playlist':
          navigate(getSettings().provider === 'none' ? routes.watchPlaylist(parsed.id) : routes.playlist(parsed.id));
          return;
        case 'channel':
          navigate(routes.channel(parsed.id));
          return;
        case 'handle':
          navigate(routes.channel(`@${parsed.handle}`));
          return;
      }
    }
    navigate(routes.search(q));
  };

  return (
    <form className={compact ? 'search search--compact' : 'search'} role="search" onSubmit={submit}>
      <label className="visually-hidden" htmlFor="search-input">
        {S.search.label}
      </label>
      <input
        id="search-input"
        className="search__input"
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={S.search.placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        enterKeyHint="search"
      />
      <button type="submit" className="button button--primary search__button">
        {S.search.button}
      </button>
    </form>
  );
}
