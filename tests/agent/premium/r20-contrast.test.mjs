import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "./gallery.mjs";

// R20 (Apple HIG Increase Contrast; Exa Ultra brief rule 7, "accessibility fallbacks first"): when the visitor asks for
// more contrast, secondary text and hairlines step up and the agent's see-through surfaces turn solid.

const read = () => {
  const workspace = document.querySelector(".oak-workspace"), surface = document.querySelector(".oak-composer__surface");
  const root = getComputedStyle(document.documentElement);
  return { muted: getComputedStyle(workspace).getPropertyValue("--muted").trim(), quiet: getComputedStyle(workspace).getPropertyValue("--quiet").trim(), line: root.getPropertyValue("--line-soft").trim(),
    workspaceBlur: getComputedStyle(workspace).backdropFilter, surfaceBlur: surface ? getComputedStyle(surface).backdropFilter : "none" };
};

test("Q24 R20 Increase Contrast lifts secondary text and hairlines and turns glass solid", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const open = async () => {
      await openState(page, "empty");
      return page.evaluate(read);
    };
    const normal = await open();
    assert.equal(normal.muted, "#b1b1b1");
    await page.emulateMedia({ contrast: "more" });
    const more = await open();
    assert.equal(more.muted, "rgba(255, 255, 255, 0.86)");
    assert.equal(more.quiet, "rgba(255, 255, 255, 0.74)", "full screen lifts quiet text too (R20 code review)");
    assert.equal(more.line, "rgba(255, 255, 255, 0.32)");
    assert.equal(more.workspaceBlur, "none");
    assert.equal(more.surfaceBlur, "none", "the composer is solid, not frosted");
  } finally { await browser.close(); }
});
