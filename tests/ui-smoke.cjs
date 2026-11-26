const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = process.cwd();
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('requestfailed', req => failedRequests.push(req.url() + ': ' + (req.failure()?.errorText || 'failed')));
  await page.route('https://telegram.org/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.Telegram={WebApp:{ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){},onEvent(){}}};'
  }));

  try {
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.locator('#app header.app-header').waitFor();
    const widths = [320, 360, 375, 390, 393, 414, 430];
    const layout = [];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(80);
      const metrics = await page.evaluate(() => ({
        width: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        appRight: Math.round(document.querySelector('#app').getBoundingClientRect().right),
        navLeft: Math.round(document.querySelector('#nav').getBoundingClientRect().left),
        navRight: Math.round(document.querySelector('#nav').getBoundingClientRect().right),
        navHeight: Math.round(document.querySelector('#nav').getBoundingClientRect().height)
      }));
      layout.push(metrics);
      if (metrics.documentWidth > width || metrics.bodyWidth > width) {
        throw new Error('Horizontal overflow at ' + width + 'px: ' + JSON.stringify(metrics));
      }
      if (metrics.navLeft < 0 || metrics.navRight > width || metrics.navHeight < 48) {
        throw new Error('Bottom navigation is outside viewport or too small at ' + width + 'px: ' + JSON.stringify(metrics));
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const nav = page.locator('#nav button');
    if (await nav.count() !== 5) throw new Error('Expected five primary navigation items');
    const sections = [];
    for (let i = 0; i < 5; i++) {
      await nav.nth(i).click();
      await page.locator('#app header').waitFor();
      sections.push(await page.locator('#app h1').first().innerText());
    }

    await page.locator('#nav button').nth(4).click();
    const appearance = page.locator('details.settings-group').filter({ hasText: 'Внешний вид' });
    await appearance.evaluate(el => { el.open = true; });
    await page.waitForTimeout(60);
    const themeButtons = appearance.locator('.theme-options button');
    if (await themeButtons.count() !== 3) throw new Error('Expected three theme mode controls');
    for (const [index, label, expected] of [[0, 'Светлая', 'light'], [1, 'Тёмная', 'dark'], [2, 'Система', null]]) {
      await themeButtons.nth(index).click();
      if (expected) {
        const actual = await page.locator('html').getAttribute('data-theme');
        if (actual !== expected) throw new Error('Theme ' + label + ' did not apply; got ' + actual);
      }
    }

    await page.locator('#nav button').nth(0).click();
    await page.locator('#app button[aria-label="Быстрое добавление"]').click();
    const quickSheet = page.locator('#ov .sheet');
    await quickSheet.waitFor();
    const quickBounds = await quickSheet.boundingBox();
    const viewportHeight = await page.evaluate(() => ({ innerHeight: window.innerHeight, visualHeight: window.visualViewport?.height || null }));
    if (!quickBounds || quickBounds.x < 0 || quickBounds.x + quickBounds.width > 390 || quickBounds.y + quickBounds.height > viewportHeight.innerHeight) {
      throw new Error('Quick-add sheet does not fit the actual phone viewport: ' + JSON.stringify({ quickBounds, viewportHeight }));
    }
    await page.locator('#ov .sheet-close').click();
    await page.locator('#ov').waitFor({ state: 'detached' });

    await page.locator('#nav button').nth(2).click();
    await page.getByRole('button', { name: /Новая задача/ }).click();
    const taskSheet = page.locator('#ov .sheet');
    await taskSheet.waitFor();
    const taskBounds = await taskSheet.boundingBox();
    const taskViewportHeight = await page.evaluate(() => window.innerHeight);
    if (!taskBounds || taskBounds.x < 0 || taskBounds.x + taskBounds.width > 390 || taskBounds.y + taskBounds.height > taskViewportHeight) {
      throw new Error('Task form does not fit the actual phone viewport: ' + JSON.stringify({ taskBounds, taskViewportHeight }));
    }
    await page.locator('#ov .sheet-close').click();
    await page.locator('#ov').waitFor({ state: 'detached' });

    if (pageErrors.length) throw new Error('Page errors: ' + pageErrors.join(' | '));
    if (consoleErrors.length) throw new Error('Console errors: ' + consoleErrors.join(' | '));
    if (failedRequests.length) throw new Error('Failed requests: ' + failedRequests.join(' | '));
    console.log(JSON.stringify({ result: 'passed', viewport: '390x844', testedWidths: widths, layout, sections, themes: ['light', 'dark', 'system'], dialogs: ['quick-add', 'task-form'], pageErrors, consoleErrors, failedRequests }, null, 2));
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
  server.close();
});
