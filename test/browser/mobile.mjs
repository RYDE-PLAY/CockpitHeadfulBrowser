import { test, expect } from '@playwright/test';
import { createRemoteFormServer } from '../fixtures/remote-form-server.mjs';

const cockpitUrl = process.env.COCKPIT_TEST_URL || 'http://127.0.0.1:9099/cockpit/@localhost/cockpit-browser/index.html';

test('renders the remote canvas in a mobile WebKit viewport', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(cockpitUrl, { waitUntil: 'domcontentloaded' });
  const canvasHost = page.locator('[data-testid="remote-canvas"]');
  const canvas = canvasHost.locator('canvas');
  const hasRenderedCanvas = async () => {
    if (!(await canvas.count())) return false;
    return canvas.evaluate(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && element.width > 0 && element.height > 0;
    }).catch(() => false);
  };

  const start = page.locator('[data-testid="start-browser"], button:has-text("Start browser")').first();
  await expect.poll(async () => {
    if (await hasRenderedCanvas()) return 'connected';
    if (await start.isVisible().catch(() => false) && await start.isEnabled().catch(() => false)) return 'stopped';
    return 'loading';
  }, { timeout: 60_000 }).toMatch(/connected|stopped/);
  if (!(await hasRenderedCanvas())) await start.click();
  await expect.poll(hasRenderedCanvas, { timeout: 60_000, message: 'mobile WebKit did not render a non-empty noVNC canvas' }).toBe(true);

  const dimensions = await canvasHost.evaluate(element => {
    const host = element.getBoundingClientRect();
    const screen = element.firstElementChild;
    const canvasElement = element.querySelector('canvas');
    return {
      host: { width: host.width, height: host.height },
      screen: screen?.getBoundingClientRect(),
      canvas: canvasElement?.getBoundingClientRect(),
      framebuffer: { width: canvasElement?.width, height: canvasElement?.height },
    };
  });
  expect(dimensions.host.width).toBeGreaterThan(0);
  expect(dimensions.host.height).toBeGreaterThan(0);
  expect(dimensions.screen?.height).toBeGreaterThan(0);
  expect(dimensions.canvas?.width).toBeGreaterThan(0);
  expect(dimensions.canvas?.height).toBeGreaterThan(0);
  expect(Math.abs(dimensions.host.width / dimensions.host.height - dimensions.framebuffer.width / dimensions.framebuffer.height)).toBeLessThan(0.02);
  expect(Math.abs(dimensions.host.width - dimensions.canvas.width)).toBeLessThan(1);
  expect(Math.abs(dimensions.host.height - dimensions.canvas.height)).toBeLessThan(1);
  const mobileInput = page.getByTestId('mobile-address-input');
  await expect(mobileInput).toBeVisible();
  await page.getByTestId('remote-address-focus').click();
  await expect(mobileInput).toBeFocused();
  const fixture = createRemoteFormServer();
  const fixtureUrl = await fixture.start();
  try {
    await mobileInput.fill(`${fixtureUrl}/remote`);
    await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Go', exact: true }).click();
    await expect.poll(() => fixture.remoteReadyCount, { timeout: 10_000 }).toBeGreaterThan(0);
    const pageInput = page.getByTestId('mobile-page-input');
    await expect(pageInput).toBeVisible();
    await pageInput.fill('mobile form value');
    await page.getByTestId('mobile-page-send').click();
    await page.getByTestId('mobile-page-enter').click();
    await expect.poll(() => fixture.submittedValue, { timeout: 10_000 }).toBe('mobile form value');
  } finally {
    await fixture.close();
  }
  expect(errors).toEqual([]);
});
