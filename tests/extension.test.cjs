const { chromium } = require('playwright');
const { createServer } = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const extensionPath = path.resolve(__dirname, '..');
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><title>Test site</title><h1>Watched site</h1>');
  });
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const port = server.address().port;
  let browser;
  const errors = [];
  try {
    browser = await chromium.launchPersistentContext('', {
      headless: false,
      ...(process.env.BROCK_BROWSER ? { channel: process.env.BROCK_BROWSER } : {}),
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    });
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const popup = await browser.newPage();
    popup.on('pageerror', (error) => errors.push(error.message));
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByRole('tab', { name: 'Settings' }).click();
    for (const [site, count] of [['localhost', '1 site'], ['127.0.0.1', '2 sites']]) {
      await popup.locator('#site-input').fill(site);
      await popup.getByRole('button', { name: 'Add' }).click();
      await popup.locator('#site-count').getByText(count).waitFor();
    }
    await popup.locator('#comparison').uncheck();
    await popup.locator('#enabled').check();
    await popup.getByRole('tab', { name: 'Results' }).click();

    const page = await browser.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://localhost:${port}/`);
    await page.locator('#brock-root h1').waitFor();
    await popup.reload();
    assert.match(await popup.locator('#active-window').innerText(), /In progress/);
    await page.getByRole('button', { name: 'Leave this site' }).click();
    await page.waitForURL('about:blank');

    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForTimeout(6500);
    const first = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_STATE' }));
    assert.equal(first.active.origin, 'localhost');
    assert.equal(first.active.switched, true);
    await worker.evaluate(async () => { finalize(Date.now() + 21 * 60 * 1000); await persist(); });
    await popup.reload();
    assert.equal(await popup.locator('#miss-count').innerText(), '1');
    assert.match(await popup.locator('#history-list').innerText(), /Switched to another watched site/);

    await page.goto(`http://localhost:${port}/`);
    await page.locator('#brock-root h1').waitFor();
    await page.getByRole('button', { name: 'Leave this site' }).click();
    await page.waitForURL('about:blank');
    await worker.evaluate(async () => { finalize(Date.now() + 21 * 60 * 1000); await persist(); });
    await popup.reload();
    assert.equal(await popup.locator('#success-count').innerText(), '1');
    assert.equal(await popup.locator('#miss-count').innerText(), '1');
    await popup.getByRole('button', { name: 'Not met' }).click();
    assert.equal(await popup.locator('.history-item').count(), 1);
    await popup.getByRole('button', { name: 'Success', exact: true }).click();
    assert.equal(await popup.locator('.history-item').count(), 1);
    assert.deepEqual(errors, []);
    console.log('PASS: Brock v2 popup, prompts, switching, outcomes, filters, and console');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
