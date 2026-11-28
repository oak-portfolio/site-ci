import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { evidence, interceptGuest, openGallery, workspace } from './fixtures/guest.mjs';
import { waitForWorkspace } from './fixtures/wait-workspace.mjs';

test('J1 first guest question crosses real client transport and opens its sources', async () => {
  mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch();
  let page, mock;
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: path.join(evidence, 'J1-video') } });
    page = await context.newPage(); mock = await interceptGuest(page, { incremental: true });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openGallery(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Oak AI Agent', exact: true }).click();
    await page.getByRole('dialog', { name: 'Oak AI Agent' }).waitFor();
    assert.equal(mock.requests.length, 0, 'opening never sends an answer');
    await page.locator('#oak-composer-input').fill('What did Steve own on EcoSmartLoop?');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForFunction(() => !!document.querySelector('[data-slot="chain-of-thought"]'));
    for (let i = 0; i < 100 && mock.requests.length === 0; i++) await delay(50);
    assert.equal(mock.requests.length, 1, 'one guest request');
    assert.equal(await workspace(page, api => api.getOakWorkspace().pending), true);
    await page.screenshot({ path: path.join(evidence, 'J1-pending.png') });
    mock.release();
    await waitForWorkspace(page, api => api.getOakWorkspace().messages.at(-1)?.steps?.some(s => s.operation === 'search' && s.state === 'done'));
    assert.equal(await workspace(page, api => api.getOakWorkspace().pending), true, 'streamed tool status reaches the UI before the answer');
    await page.screenshot({ path: path.join(evidence, 'J1-streaming.png') });
    await mock.finish();
    await page.waitForFunction(() => document.querySelector('.oak-turn__answer'));
    await waitForWorkspace(page, api => !api.getOakWorkspace().pending);
    const final = await workspace(page, api => ({ pending: api.getOakWorkspace().pending, messages: api.getOakWorkspace().messages.map(m => ({ role: m.role, state: m.state, failure: m.failure, text: m.text })) }));
    assert.equal(final.pending, false); assert.equal(final.messages.at(-1).state, 'complete');
    assert.ok(final.messages.at(-1).text.length > 50);
    const source = page.getByRole('button', { name: /^Sources:/ }).first();
    await source.click();
    const panel = page.locator('.oak-source-popover[aria-label="Sources for this point"]');
    await panel.waitFor();
    assert.ok(await panel.getByRole('link').count() > 0, 'source popover offers a real public link');
    const link = panel.getByRole('link').first();
    const href = await link.getAttribute('href'); assert.match(href, /^https:\/\//);
    await page.route(url => url.href.split('#')[0] === href.split('#')[0], route => route.fulfill({ contentType: 'text/html', body: '<h1>Intercepted source destination</h1>' }));
    await page.screenshot({ path: path.join(evidence, 'J1-sources.png') });
    await link.click(); await page.getByRole('heading', { name: 'Intercepted source destination' }).waitFor();
    assert.deepEqual(errors, []);
    writeFileSync(path.join(evidence, 'J1-result.json'), JSON.stringify({ final, sourceHref: href, errors, requests: mock.requests.length }, null, 2));
    await context.close();
  } catch (error) {
    if (page && !page.isClosed()) { await page.screenshot({ path: path.join(evidence, 'J1-failure.png') }); writeFileSync(path.join(evidence, 'J1-failure.txt'), String(error.stack)); }
    throw error;
  } finally { await mock?.close(); await browser.close(); }
});
