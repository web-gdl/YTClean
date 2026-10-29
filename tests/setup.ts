import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

// jsdom no implementa scrollTo; el enrutador lo llama al navegar.
Object.defineProperty(window, 'scrollTo', { value: () => undefined, writable: true });
