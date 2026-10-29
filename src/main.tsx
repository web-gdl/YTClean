import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyTheme } from './app/theme';
import { getSettings, subscribeSettings } from './storage/settings';
import './styles/global.css';

// El tema se aplica antes del primer render para evitar un destello y se
// mantiene sincronizado (también si cambia desde otra pestaña).
applyTheme(getSettings().theme);
subscribeSettings(() => applyTheme(getSettings().theme));

// En la app Android, el botón Atrás navega por el historial y sale en la portada.
void (async () => {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;
  const { App: NativeApp } = await import('@capacitor/app');
  await NativeApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void NativeApp.exitApp();
  });
})();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
