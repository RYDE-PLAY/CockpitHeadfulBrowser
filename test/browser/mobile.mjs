import { test, expect } from '@playwright/test';

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
    const screen = element.firstElementChild;
    const canvasElement = element.querySelector('canvas');
    return {
      screen: screen?.getBoundingClientRect(),
      canvas: canvasElement?.getBoundingClientRect(),
    };
  });
  expect(dimensions.screen?.height).toBeGreaterThan(0);
  expect(dimensions.canvas?.width).toBeGreaterThan(0);
  expect(dimensions.canvas?.height).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
