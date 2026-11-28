import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const read = (file) => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(500);
};

test("D68-G1 the lens pass over all 60 states: one message box per job, a question that previews, and an inset menu focus ring", async () => {
  // Voice, saved conversations and sign-in carry their own actions too, so the message box steps aside there as well.
  const conversation = read("src/components/agent/OakConversation.tsx");
  // A running answer keeps the message box live, so Stop and Escape still reach it.
  // R11 (intentional update): verification mode also stands the composer by.
  assert.match(conversation, /standbySurface = \["brief", "funding", "documents", "voice", "conversation", "account"\]\.includes\(surface\)[\s\S]*standby=\{verifying \|\| \(!state\.pending && standbySurface\)\}/);
  // Use transcript focuses the message box after it is back on screen, not while it is still hidden.
  assert.match(conversation, /onUseTranscript=\{text => \{ if \(useOakVoiceTranscript\(text\)\) requestComposerFocus\(\); \}\}/);
  // The question panel says "Review the message below" only when there is a message to review.
  assert.match(read("src/components/agent/OakWorkflowPanels.tsx"), /message\.trim\(\) \? "Review the message below\." : "Fill in both to see your message\."/);
  // R15 (intentional update, Oak review v12): keyboard focus rings the menu glide, the same shape as the hover fill.
  assert.match(read("src/styles/oakAgent.css"), /\.oak-workspace \.ui-menu__popup:has\(\.ui-menu__item:not\(\.oak-account-menu__signin\):focus-visible\) \.ui-menu__glide \{\n  outline: 2px solid var\(--oak-focus\);/);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const state of ["voice-recording", "voice-review", "saved-list", "account-purpose"]) {
      await open(page, state);
      assert.equal(await page.locator(".oak-composer").evaluate(node => getComputedStyle(node).display), "none", `${state}: the message box steps aside`);
    }
    // A sign-in prompt over the transcript (not its own panel) keeps the message box, so the visitor's draft stays in view.
    await open(page, "sign-in-again");
    assert.notEqual(await page.locator(".oak-composer").evaluate(node => getComputedStyle(node).display), "none", "sign-in-again keeps the message box");
    // The question draft shows the message it will send, under a footnote that points at it.
    await open(page, "question-draft");
    assert.match(await page.locator(".oak-group__preview").innerText(), /Topic: Agent memory/);
    assert.match(await page.locator(".oak-group__footnote").first().innerText(), /^Review the message below/);
    assert.equal(await page.getByRole("button", { name: /^Send/ }).last().isDisabled(), false);
    // Use transcript returns to chat with the transcript in the message box, focused.
    await open(page, "voice-review");
    await page.getByRole("button", { name: "Use transcript" }).click();
    await page.waitForTimeout(500);
    const composer = page.locator("#oak-composer-input");
    assert.match(await composer.inputValue(), /keep long term/);
    assert.equal(await composer.evaluate(node => node === document.activeElement), true, "the message box has focus");
    // A focused menu row wears the workspace focus ring inside the row (soft white since D69), not the site's solid white outline.
    await open(page, "tools-menu");
    // R15 (intentional update): the ring sits on the menu glide, the hover fill's own shape; the row draws none.
    await page.keyboard.press("ArrowDown"); await page.waitForTimeout(300);
    const ring = await page.locator(".ui-menu__glide").first().evaluate(node => ({ style: getComputedStyle(node).outlineStyle, color: getComputedStyle(node).outlineColor }));
    const row = await page.locator(".oak-task-menu__item:focus-visible").first().evaluate(node => getComputedStyle(node).outlineStyle);
    assert.equal(row, "none", "the focused row draws no second outline");
    assert.equal(ring.style, "solid", "the glide wears the focus ring");
    assert.notEqual(ring.color, "rgb(255, 255, 255)", `menu focus ring is the soft workspace ring (${ring.color})`);
  } finally {
    await browser.close();
  }
});
