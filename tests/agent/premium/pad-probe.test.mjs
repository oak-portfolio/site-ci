import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { padDiff, padProbe } from "./pad-probe.mjs";
import { openState } from "./gallery.mjs";

// Retro arch 6: the padding baseline has to be stable on a reread and has to fail when one frame's padding moves by a
// step, or a "zero differences" refactor proof means nothing.
test("arch 6 the pad probe is stable on a reread and catches one frame's padding moving", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    for (const [state, selector] of [["answer-openui-proposal", ".oak-next-step"], ["saved-list", ".oak-saved__inset"]]) {
      await openState(page, state, { settle: 400 });
      const before = { [state]: await page.evaluate(padProbe) };
      assert.ok(Object.keys(before[state]).length > 10, `${state}: the probe records padded elements`);
      await openState(page, state, { settle: 400 });
      assert.deepEqual(padDiff(before, { [state]: await page.evaluate(padProbe) }), [], `${state}: a reread matches`);
      await page.addStyleTag({ content: `.oak-workspace ${selector} { padding-inline-start: calc(var(--space-md) - var(--space-xs)) !important; }` });
      await page.waitForTimeout(100);
      const diff = padDiff(before, { [state]: await page.evaluate(padProbe) });
      // The changed element is the path's last step, so a descendant's line (which names its ancestors) does not count.
      const own = new RegExp(`\\${selector}:\\d+(::\\w+)?: `);
      assert.ok(diff.some(line => own.test(line)), `${state}: the probe catches ${selector} itself moving 8px`);
    }
  } finally { await browser.close(); }
});
