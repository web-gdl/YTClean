import { describe, expect, it } from 'vitest';
import { buildHeaderCsp, buildMetaCsp, SECURITY_HEADERS } from '../scripts/csp.mjs';

describe('CSP', () => {
  it('no permite código en línea ni scripts externos', () => {
    const csp = buildMetaCsp();
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
  });
  it('solo permite enmarcar el reproductor de privacidad mejorada', () => {
    const frame = /frame-src ([^;]+)/.exec(buildMetaCsp())?.[1];
    expect(frame).toBe('https://www.youtube-nocookie.com');
  });
  it('acepta restricciones por entorno', () => {
    const csp = buildMetaCsp({ connect: 'https://www.googleapis.com', img: 'https://i.ytimg.com' });
    expect(csp).toContain("connect-src 'self' https://www.googleapis.com");
    expect(csp).toContain("img-src 'self' data: https://i.ytimg.com");
  });
  it('la versión para cabeceras añade frame-ancestors', () => {
    expect(buildHeaderCsp()).toContain("frame-ancestors 'none'");
    expect(SECURITY_HEADERS['Referrer-Policy']).toBe('no-referrer');
  });
});
