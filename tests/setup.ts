import { afterEach } from 'vitest';

// Las pruebas del servicio local corren en Node (sin DOM): el resto, en jsdom.
const hasDom = typeof window !== 'undefined';

if (hasDom) {
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  // jsdom no implementa scrollTo; el enrutador lo llama al navegar.
  Object.defineProperty(window, 'scrollTo', { value: () => undefined, writable: true });
}
