import { test, expect } from '@playwright/test';
import { createRemoteFormServer } from '../fixtures/remote-form-server.mjs';
import fs from 'node:fs';

const cockpitUrl = process.env.COCKPIT_TEST_URL || 'http://127.0.0.1:9099/cockpit/@localhost/cockpit-browser/index.html';
const readySelector = process.env.COCKPIT_READY_SELECTOR;
const readyText = process.env.COCKPIT_READY_TEXT;
const canvasSelector = process.env.COCKPIT_CANVAS_SELECTOR || '[data-testid="remote-canvas"] canvas:visible';
const addressFocusSelector = process.env.COCKPIT_ADDRESS_FOCUS_SELECTOR || '[data-testid="remote-address-focus"]';
const toolbarSelector = process.env.COCKPIT_TOOLBAR_SELECTOR || '[data-testid="remote-toolbar"]';
const startSelector = process.env.COCKPIT_START_SELECTOR || '[data-testid="start-browser"], button:has-text("Start browser")';

async function openConnectedPage(page) {
  await page.goto(cockpitUrl, { waitUntil: 'domcontentloaded' });
  const canvas = page.locator(canvasSelector).first();
  const hasPixels = async () => {
    const count = await canvas.count();
    if (!count) return false;
    return canvas.evaluate(element => {
    if (!(element instanceof HTMLCanvasElement)) return false;
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && element.width > 0 && element.height > 0;
    }).catch(() => false);
  };
  if (!(await hasPixels())) {
    const start = page.locator(startSelector).first();
    const readState = async () => {
      if (await hasPixels()) return 'connected';
      if (await start.isVisible().catch(() => false) && await start.isEnabled().catch(() => false)) return 'stopped';
      return 'loading';
    };
    await expect.poll(readState, { timeout: 60_000, message: 'browser session stayed loading without a canvas or Start browser control' }).toMatch(/connected|stopped/);
    const state = await readState();
    if (state === 'stopped') await start.click();
  }
  await expect.poll(hasPixels, { timeout: 60_000, message: 'browser session did not expose a non-empty canvas' }).toBe(true);
  await expect(page.locator(addressFocusSelector)).toBeEnabled({ timeout: 60_000 });
  return canvas;
}

test.describe('Cockpit browser smoke', () => {
  test('opens from the Cockpit menu even when video capability detection is slow', async ({ page }) => {
    await page.addInitScript(() => {
      if (!globalThis.VideoDecoder) return;
      const original = VideoDecoder.isConfigSupported.bind(VideoDecoder);
      VideoDecoder.isConfigSupported = async config => {
        await new Promise(resolve => setTimeout(resolve, 1500));
        return original(config);
      };
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('/system', cockpitUrl).href);
    await page.getByRole('link', { name: 'Browser', exact: true }).click();
    const plugin = page.frameLocator('iframe[src*="cockpit-browser/index.html"]');
    await expect(plugin.getByRole('heading', { name: 'Browser', exact: true })).toBeVisible();
    await expect(plugin.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled();
    await page.screenshot({ path: 'artifacts/shell-fixed.png', fullPage: true });
    expect(errors).toEqual([]);
  });

  test('loads Simplified Chinese translations without script initialization errors', async ({ page, context }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.addCookies([{ name: 'CockpitLang', value: 'zh-cn', url: new URL(cockpitUrl).origin }]);
    await page.goto(cockpitUrl);
    await expect(page.getByRole('heading', { name: '浏览器', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('loads the real frontend and reaches a usable document', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    const response = await page.goto(cockpitUrl, { waitUntil: 'domcontentloaded' });
    expect(response, 'Cockpit frontend did not return a response').toBeTruthy();
    expect(response.status(), 'Cockpit frontend returned an HTTP error').toBeLessThan(400);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('body')).not.toHaveText(/(internal server error|failed to load module)/i);
    if (readySelector) await expect(page.locator(readySelector)).toBeVisible();
    else if (readyText) await expect(page.getByText(readyText, { exact: false })).toBeVisible();
    else await expect(page.locator('#app, [data-cockpit-browser-root], main').first()).toBeVisible();
    await openConnectedPage(page);
    expect(consoleErrors, `browser console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('applies light and dark theme state through the Cockpit style event', async ({ page }) => {
    const canvas = await openConnectedPage(page);
    await expect(page.locator(toolbarSelector)).toBeVisible();
    const toolbar = page.locator(toolbarSelector);
    const identity = `canvas-${Date.now()}-${Math.random()}`;
    await canvas.evaluate((element, value) => { element.dataset.smokeIdentity = value; }, identity);
    const setStyle = style => page.evaluate(styleName => {
      window.dispatchEvent(new CustomEvent('cockpit-style', { detail: { style: styleName } }));
    }, style);
    await setStyle('light');
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('pf-v6-theme-dark'))).toBe(false);
    const light = await toolbar.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, dark: document.documentElement.classList.contains('pf-v6-theme-dark') }));
    fs.mkdirSync('artifacts', { recursive: true });
    await page.screenshot({ path: 'artifacts/light.png', fullPage: true });
    await setStyle('dark');
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('pf-v6-theme-dark'))).toBe(true);
    await expect.poll(() => toolbar.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(light.background);
    const dark = await toolbar.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, dark: document.documentElement.classList.contains('pf-v6-theme-dark') }));
    await expect.poll(() => page.locator(canvasSelector).first().getAttribute('data-smoke-identity')).toBe(identity);
    expect(light.dark).toBe(false);
    expect(dark.dark).toBe(true);
    expect(dark.background).not.toBe(light.background);
    await page.screenshot({ path: 'artifacts/dark.png', fullPage: true });
  });

  test('plugin canvas navigates to a controlled remote page and submits a real form', async ({ page }) => {
    const fixture = createRemoteFormServer();
    const fixtureUrl = await fixture.start();
    try {
      await openConnectedPage(page);
      await page.locator(addressFocusSelector).click();
      await page.keyboard.type(`${fixtureUrl}/remote`);
      await page.keyboard.press('Enter');
      await expect.poll(() => fixture.remoteGetCount, { timeout: 10_000 }).toBeGreaterThan(0);
      await expect.poll(() => fixture.remoteReadyCount, { timeout: 10_000 }).toBeGreaterThan(0);
      await page.keyboard.type('cockpit-browser smoke');
      // The fixture page autofocuses its form input. Tab reaches the button;
      // Enter performs the real POST through the plugin's remote browser.
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await expect.poll(() => fixture.submittedValue, { timeout: 10_000 }).toBe('cockpit-browser smoke');
    } finally {
      await fixture.close();
    }
  });

  test('fixture self-test: direct HTTP form submission', async () => {
    const fixture = createRemoteFormServer();
    const fixtureUrl = await fixture.start();
    try {
      expect((await fetch(fixtureUrl)).ok).toBe(true);
      const response = await fetch(`${fixtureUrl}/submit`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'value=cockpit-browser%20smoke' });
      expect(response.ok).toBe(true);
      expect(fixture.submittedValue).toBe('cockpit-browser smoke');
    } finally {
      await fixture.close();
    }
  });

  test('pastes Chinese through the remote clipboard and submits it', async ({ page }) => {
    const fixture = createRemoteFormServer();
    const url = await fixture.start();
    try {
      await openConnectedPage(page);
      await page.locator(addressFocusSelector).click();
      await page.keyboard.type(`${url}/remote`);
      await page.keyboard.press('Enter');
      await expect.poll(() => fixture.remoteReadyCount).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Clipboard', exact: true }).click();
      await page.getByRole('textbox', { name: 'Clipboard text' }).fill('中文输入测试');
      await page.getByRole('button', { name: 'Paste into browser' }).click();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await expect.poll(() => fixture.submittedValue).toBe('中文输入测试');
    } finally {
      await fixture.close();
    }
  });

  test('settings draft survives polling and rejects an invalid homepage', async ({ page }) => {
    await openConnectedPage(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const homepage = dialog.getByRole('textbox', { name: 'Homepage' });
    await homepage.fill('javascript:alert(1)');
    await page.waitForTimeout(5500);
    await expect(homepage).toHaveValue('javascript:alert(1)');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog.getByText('Homepage must be an http(s) URL or about:blank.')).toBeVisible();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  });
});
