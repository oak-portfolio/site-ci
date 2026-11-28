import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { waitForWorkspace } from './fixtures/wait-workspace.mjs';

const origin = 'http://oak-wait.test';
const store = `let state = { pending: true, phase: 'busy' };
export const getOakWorkspace = () => state;
export const setOakWorkspaceFixture = next => { state = { ...state, ...next }; };`;

const storePage = '<!doctype html><script type="module">import "/src/lib/oakWorkspace.ts";</script>';

async function withStore(run, html = storePage) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route(`${origin}/**`, route => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/src/lib/oakWorkspace.ts') return route.fulfill({ contentType: 'text/javascript', body: store });
      return route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.goto(`${origin}/`);
    await run(page);
  } finally { await browser.close(); }
}

const later = (page, next, ms) => page.evaluate(([next, ms]) => {
  setTimeout(async () => (await import('/src/lib/oakWorkspace.ts')).setOakWorkspaceFixture(next), ms);
}, [next, ms]);

test('workspace wait: a condition that never holds times out', async () => withStore(async page => {
  const started = Date.now();
  await assert.rejects(waitForWorkspace(page, api => api.getOakWorkspace().pending === false, { timeout: 1200 }), /Timeout/);
  assert.ok(Date.now() - started >= 1100, 'the wait lasted until its timeout');
}));

test('workspace wait: returns only once the condition holds', async () => withStore(async page => {
  await later(page, { pending: false }, 600);
  const started = Date.now();
  await waitForWorkspace(page, api => api.getOakWorkspace().pending === false, { timeout: 5000 });
  assert.ok(Date.now() - started >= 500, 'the wait did not pass before the store changed');
  assert.equal(await page.evaluate(async () => (await import('/src/lib/oakWorkspace.ts')).getOakWorkspace().pending), false);
}));

test('workspace wait: passes the argument to the predicate', async () => withStore(async page => {
  await later(page, { phase: 'idle' }, 200);
  await waitForWorkspace(page, (api, phase) => api.getOakWorkspace().phase === phase, { arg: 'idle', timeout: 5000 });
}));

test('workspace wait: an async predicate is refused', async () => withStore(async page => {
  await assert.rejects(waitForWorkspace(page, async api => api.getOakWorkspace().pending, { timeout: 1500 }), /synchronous/);
}));

test('workspace wait: a predicate that returns a Promise is refused', async () => withStore(async page => {
  const started = Date.now();
  await assert.rejects(waitForWorkspace(page, api => Promise.resolve(api.getOakWorkspace().pending), { timeout: 3000 }), /synchronous/);
  assert.ok(Date.now() - started < 2500, 'refused before the timeout');
}));

test('workspace wait: reads the store instance the page loaded', async () => withStore(async page => {
  await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('/src/lib/oakWorkspace.ts?v=1')));
  await waitForWorkspace(page, api => api.getOakWorkspace().pending === false, { timeout: 3000 });
}, '<!doctype html><script type="module">const w = await import("/src/lib/oakWorkspace.ts?v=1"); setTimeout(() => w.setOakWorkspaceFixture({ pending: false }), 400);</script>'));
