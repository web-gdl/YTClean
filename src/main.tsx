import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme } from './app/theme';
import { getSettings, subscribeSettings } from './storage/settings';
import './styles/global.css';

// El tema se aplica antes del primer render para evitar un destello y se
// mantiene sincronizado (también si cambia desde otra pestaña).
applyTheme(getSettings().theme);
subscribeSettings(() => applyTheme(getSettings().theme));

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
