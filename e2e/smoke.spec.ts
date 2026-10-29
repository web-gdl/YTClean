import { expect, test, type Page } from '@playwright/test';

/** Registra toda petición que salga del origen de la aplicación. */
function trackExternal(page: Page): string[] {
  const external: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.origin !== 'http://127.0.0.1:4173') external.push(req.url());
  });
  return external;
}

function trackCspErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) errors.push(msg.text());
  });
  return errors;
}

test('la portada no realiza ninguna conexión externa y respeta la CSP', async ({ page }) => {
  const external = trackExternal(page);
  const cspErrors = trackCspErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Un reproductor tranquilo');
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(external).toEqual([]);
  expect(cspErrors).toEqual([]);
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
  expect(await page.evaluate(() => document.cookie)).toBe('');
});

test('un enlace directo muestra la fachada y solo carga el reproductor al pulsar', async ({ page }) => {
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' }));
  await page.route('https://i.ytimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAAAAACw=', 'base64') }));
  const external = trackExternal(page);
  await page.goto('/');
  await page.getByLabel('Pega un enlace para reproducirlo sin configurar nada:').fill('https://youtu.be/dQw4w9WgXcQ?t=30');
  await page.getByRole('button', { name: 'Abrir enlace' }).click();
  await expect(page).toHaveURL(/\/ver\/dQw4w9WgXcQ\?t=30$/);
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(external.filter((u) => u.includes('youtube-nocookie'))).toEqual([]);

  await page.getByRole('button', { name: /Reproducir/ }).click();
  const iframe = page.locator('iframe');
  await expect(iframe).toHaveCount(1);
  const src = new URL((await iframe.getAttribute('src')) ?? '');
  expect(src.origin).toBe('https://www.youtube-nocookie.com');
  expect(src.pathname).toBe('/embed/dQw4w9WgXcQ');
  expect(src.searchParams.get('start')).toBe('30');
  expect(await iframe.getAttribute('sandbox')).toContain('allow-scripts');
});

test('los ajustes se guardan solo al cambiarlos y se pueden borrar', async ({ page }) => {
  await page.goto('/ajustes');
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
  await page.getByLabel('Instancia de Invidious').check();
  await page.getByLabel('URL de la instancia').fill('https://inv.ejemplo.org/');
  await page.getByLabel('URL de la instancia').blur();
  await expect
    .poll(async () => page.evaluate(() => window.localStorage.getItem('yc:settings')))
    .toContain('"invidiousInstance":"https://inv.ejemplo.org"');
  await page.getByLabel('Oscuro').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Borrar todos los datos locales' }).click();
  await expect(page.getByText('Datos locales borrados.')).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
});

test('la búsqueda sin fuente de datos explica qué falta', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox').fill('lentejas');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page).toHaveURL(/\/buscar\?q=lentejas/);
  await expect(page.getByRole('alert')).toContainText('No hay ninguna fuente de datos configurada');
  await expect(page.getByRole('link', { name: 'Elegir fuente de datos' })).toBeVisible();
});

test('la página de privacidad enumera las conexiones del inventario', async ({ page }) => {
  await page.goto('/privacidad');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Privacidad');
  await expect(page.getByText('www.youtube-nocookie.com', { exact: true })).toBeVisible();
  await expect(page.getByText('www.googleapis.com', { exact: true })).toBeVisible();
});

test('una ruta desconocida muestra la página de no encontrado', async ({ page }) => {
  await page.goto('/no/existe');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Página no encontrada');
});
