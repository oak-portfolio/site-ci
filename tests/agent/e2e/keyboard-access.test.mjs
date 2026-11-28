import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { evidence, interceptGuest, openGallery, workspace } from './fixtures/guest.mjs';

for (const width of [1280, 390]) test(`J11 ${width}px keyboard, accessible names and reduced motion across guest, auth and history`, async () => {
  mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch();
  const observations = [];
  let page;
  try {
    page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await interceptGuest(page);
    for (const state of ['empty', 'sign-in', 'saved-list', 'account-purpose', 'answer-sourced']) {
      await openGallery(page, state);
      const dialog = page.getByRole('dialog').first();
      await dialog.waitFor();
      const snapshot = await dialog.ariaSnapshot();
      writeFileSync(path.join(evidence, `J11-${width}-${state}.aria.txt`), snapshot);
      assert.match(snapshot, /Oak AI Agent/, 'workspace exposes its accessible title');
      assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
      const unnamed = await dialog.locator('button:visible').evaluateAll(nodes => nodes.filter(node => !(
        node.getAttribute('aria-label') || node.textContent?.trim() || node.getAttribute('aria-labelledby')?.split(/\s+/).some(id => document.getElementById(id)?.textContent?.trim())
      )).map(node => node.outerHTML.slice(0, 180)));
      assert.deepEqual(unnamed, [], `${state}: visible buttons have a name`);
      await page.waitForFunction(() => !!document.activeElement?.closest('[role="dialog"]'), null, { timeout: 10000 });
      await dialog.locator('button:visible').first().focus();
      const focus = [];
      for (let i = 0; i < 35; i++) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(25);
        await page.waitForFunction(() => !document.activeElement?.hasAttribute('data-base-ui-focus-guard'), null, { timeout: 1000 }).catch(() => {});
        focus.push(await page.evaluate(() => ({ inside: !!document.activeElement?.closest('[role="dialog"]'),
          name: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim().slice(0, 70), tag: document.activeElement?.tagName })));
      }
      writeFileSync(path.join(evidence, `J11-${width}-${state}-focus.json`), JSON.stringify(focus, null, 2));
      assert.ok(focus.every(item => item.inside), `${state}: modal contains keyboard focus`);
      assert.ok(focus.some(item => /close/i.test(item.name)), `${state}: keyboard can reach Close`);
      observations.push({ state, focus });
      await page.screenshot({ path: path.join(evidence, `J11-${width}-${state}.png`) });
      for (let i = 0; i < 3 && await page.getByRole('dialog').count(); i++) await page.keyboard.press('Escape');
      assert.equal(await workspace(page, api => api.getOakWorkspace().presentation), 'human-browse', `${state}: Escape can close the workspace`);
    }
    writeFileSync(path.join(evidence, `J11-${width}-result.json`), JSON.stringify({ width, observations, limitation: 'Chromium accessibility tree and keyboard checks. No physical screen-reader speech engine exercised.' }, null, 2));
  } catch (error) {
    if (page && !page.isClosed()) { await page.screenshot({ path: path.join(evidence, `J11-${width}-failure.png`) }); writeFileSync(path.join(evidence, `J11-${width}-failure.txt`), String(error.stack)); }
    throw error;
  } finally { await browser.close(); }
});
