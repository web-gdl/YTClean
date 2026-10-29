import { Component, type ReactNode } from 'react';
import { href } from '../app/router';

/** Evita la pantalla en blanco si un componente falla al renderizar. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="page" role="alert">
          <h1 className="page__title">Algo ha fallado</h1>
          <p className="muted">{this.state.error.message}</p>
          <p>
            <a className="button" href={href('/')}>
              Volver al inicio
            </a>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
