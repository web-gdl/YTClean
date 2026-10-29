export type Theme = 'system' | 'light' | 'dark';

/** Aplica el tema al documento. "system" delega en prefers-color-scheme. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
