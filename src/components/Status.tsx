import { S } from '../app/strings';
import type { ProviderError } from '../data/types';
import { Link } from './Link';
import { routes } from '../app/router';

export function Loading({ text = S.status.loading }: { text?: string }) {
  return (
    <p className="status status--loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {text}
    </p>
  );
}

export function ErrorBox({ error, onRetry }: { error: ProviderError; onRetry?: (() => void) | undefined }) {
  const text = S.status.errors[error.code] ?? error.message;
  return (
    <div className="status status--error" role="alert">
      <p>
        <strong>{S.status.errorTitle}.</strong> {text}
        {error.status ? <span className="muted"> (HTTP {error.status})</span> : null}
      </p>
      <div className="status__actions">
        {error.code === 'not-configured' ? (
          <Link className="button" to={routes.settings()}>
            {S.search.noProviderAction}
          </Link>
        ) : null}
        {onRetry && error.code !== 'not-configured' ? (
          <button type="button" className="button" onClick={onRetry}>
            {S.status.retry}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <p className="status status--empty" role="status">
      {text}
    </p>
  );
}
