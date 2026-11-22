import { ownServer } from '../support/own-server.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const base = ownServer(process.env.OAK_GALLERY_URL ?? 'http://127.0.0.1:4321');
async function open(browser, state, init) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  await page.goto(`${base}/__dev/oak-states?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === 'ready', null, { timeout: 30000 });
  return page;
}
const store = (page, fn, arg) => page.evaluate(async ([source, value]) => {
  const url = performance.getEntriesByType('resource').map(e => e.name).find(n => /\/src\/lib\/oakWorkspace\.ts(\?|$)/.test(n));
  return new Function('workspace', 'value', `return (${source})(workspace, value)`)(await import(url), value);
}, [fn.toString(), arg]);

test('J3 allowance notice, refill information and sign-in entry', async () => {
  const browser = await chromium.launch();
  try {
    const page = await open(browser, 'quota-reached-guest');
    const card = page.locator('.oak-turn__stopped');
    assert.match(await card.innerText(), /used the answers available for now/i);
    assert.match(await card.innerText(), /one comes back every 4 hours/i);
    assert.equal(await page.getByRole('button', { name: /sign in, account and settings/i }).count(), 1);
    await page.getByRole('button', { name: /sign in, account and settings/i }).click();
    await page.getByRole('menuitem', { name: /^sign in$/i }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('menuitem', { name: /^sign in$/i }).waitFor({ state: 'hidden' });
    // Guest sign-in saves conversations; it does not increase the allowance.
    await store(page, workspace => { const status = workspace.getOakWorkspace().authStatus; workspace.setOakWorkspaceFixture({ authStatus: { ...status, allowance: { ...status.allowance, answers: { ...status.allowance.answers, refillsAt: Date.now() + 3600000 } } } }); });
    await page.locator('.oak-composer__meter').click();
    assert.match(await page.locator('.oak-usage-card__detail').filter({ hasText: /^Next answer back at / }).innerText(), /Next answer back at .+/);
  } finally { await browser.close(); }
});

test('J3 Turnstile failure leaves a retry path', async () => {
  const browser = await chromium.launch();
  try {
    const page = await open(browser, 'empty', () => { window.turnstile = { render(_node, options) { window.__turnstileOptions = options; queueMicrotask(() => options['error-callback']()); return 'dummy'; }, reset() {}, remove() {} }; });
    await store(page, workspace => { const authStatus = workspace.getOakWorkspace().authStatus; workspace.setOakWorkspaceFixture({ authStatus: { ...authStatus, turnstileSiteKey: '2x00000000000000000000AB', humanPassed: false } }); });
    await page.waitForFunction(() => window.__turnstileOptions?.sitekey === '2x00000000000000000000AB');
    await page.waitForFunction(() => /check.*(failed|retry)|try.*check/i.test(document.body.innerText));
    assert.match(await page.locator('body').innerText(), /check/i);
  } finally { await browser.close(); }
});

test('J9 stopped step Retry and Continue resend the original question', async () => {
  const browser = await chromium.launch();
  try {
    for (const [state, label] of [['trail-stopped', 'Retry'], ['trail-interrupted', 'Continue']]) {
      const page = await open(browser, state); const sent = [];
      await page.route('**/api/oak/chat**', async route => { sent.push(JSON.parse(route.request().postData())); await route.abort(); });
      const box = page.locator('textarea.ui-textarea').first(); await box.fill('Unsent draft');
      await page.locator('.oak-cot__step[data-state="error"] .oak-cot__again').getByText(label).click();
      for (let i = 0; i < 100 && sent.length === 0; i++) await page.waitForTimeout(50);
      await page.waitForFunction(() => document.querySelector('.oak-turn__stopped'), null, { timeout: 10000 });
      assert.equal(sent.length, 1); assert.equal((sent[0].turn?.task ?? sent[0].task).text, 'How does Steve approach AI systems?');
      assert.equal(await box.inputValue(), 'Unsent draft'); await page.context().close();
    }
  } finally { await browser.close(); }
});

test('J9 connection drops after stream starts and leaves Retry', async () => {
  let streamStarted; const started = new Promise(resolve => { streamStarted = resolve; });
  const server = createServer((req, res) => {
    streamStarted();
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1', 'Access-Control-Allow-Origin': base });
    res.write('data: {"type":"start"}\n\n'); setTimeout(() => res.socket?.destroy(), 100);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/oak/chat`;
  const browser = await chromium.launch();
  try {
    const page = await open(browser, 'trail-stopped');
    await page.route('**/api/oak/chat**', route => route.continue({ url: endpoint }));
    await page.locator('.oak-cot__step[data-state="error"] .oak-cot__again').click();
    await started;
    await page.waitForFunction(() => !document.querySelector('.ui-chain-of-thought[data-state=live]') && document.querySelector('.oak-turn__stopped button'), null, { timeout: 15000 });
    assert.ok(await page.locator('.oak-turn__stopped').getByRole('button', { name: 'Retry' }).count());
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
