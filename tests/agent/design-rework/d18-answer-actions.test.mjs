import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const actions = loadTsx("src/lib/oakAnswerActions.ts");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(600);
};

// D122: the numbered pill gave way to an unnumbered chip; numbers live in the Sources panel (d122-sources G4).
test("D18-G1 a point's source chip opens a source preview on hover and on keyboard focus", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await open(page, "answer-sourced");
    const chip = page.locator(".oak-turn__answer .oak-source-chip__trigger").first();
    await chip.scrollIntoViewIfNeeded();
    await chip.hover();
    await page.locator(".oak-source-popover").waitFor({ timeout: 3000 });
    assert.match(await page.locator(".oak-source-popover").innerText(), /Case study[\s\S]*Portfolio[\s\S]*EcoSmartLoop/);
    assert.match(await page.locator(".oak-source-popover a.oak-source-row").first().getAttribute("href"), /^https:\/\/steveoak\.com\/work\/ecosmartloop\//, "the row opens the cited page");
    await page.mouse.move(5, 5);
    await page.locator(".oak-source-popover").waitFor({ state: "detached", timeout: 3000 });
    await chip.focus();
    await page.keyboard.press("Enter");
    await page.locator(".oak-source-popover").waitFor({ timeout: 3000 });
  } finally {
    await browser.close();
  }
});

test("D18-G2 a complete answer offers copy, copy with sources, and Open in ChatGPT, Claude and Perplexity", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await open(page, "answer-sourced");
    const footer = page.locator(".ui-message__footer").last();
    // Review v4: Copy answer stays on the turn (flip2: in the ornament's labeled Copy); Copy with sources and the open-in links live in the row's More menu.
    assert.equal(await page.locator("[data-message-id]:has(.ui-message__footer)").last().getByRole("button", { name: "Copy answer" }).count(), 1, "Copy answer");
    await footer.getByRole("button", { name: "More actions" }).click();
    const menu = page.getByRole("menu", { name: "More actions" });
    await menu.waitFor({ timeout: 3000 });
    assert.equal(await menu.getByRole("menuitem", { name: "Copy with sources" }).count(), 1, "Copy with sources");
    for (const name of ["Open in ChatGPT (new tab)", "Open in Claude (new tab)", "Open in Perplexity (new tab)"]) {
      const link = menu.getByRole("menuitem", { name });
      assert.equal(await link.count(), 1, name);
      assert.equal(await link.getAttribute("target"), "_blank", `${name} opens a new tab`);
    }
  } finally {
    await browser.close();
  }
  const answer = { kind: "sourced", knowledgeRevision: "r", claims: [{ id: "c", text: "t", citations: [
    { documentId: "work:ecosmartloop", passageId: "p", sectionId: "s", url: "https://steveoak.com/work/ecosmartloop/#ownership" }] }] };
  assert.equal(actions.oakAnswerWithSources("Answer.", answer, { documents: [] }), "Answer.\n\nSources:\n1. [Source 1](https://steveoak.com/work/ecosmartloop/#ownership)");
});

test("D18-G3 open-in links are external, open a new tab, and point other assistants at the /api/md mirror", () => {
  const cite = (url) => ({ documentId: "work:x", passageId: "p", sectionId: "s", url });
  const answer = { kind: "sourced", knowledgeRevision: "r", claims: [{ id: "c", text: "t", citations: [cite("https://steveoak.com/work/ecosmartloop/#a"), cite("https://steveoak.com/work"), cite("https://example.com/codex/legacy")] }] };
  assert.equal(actions.oakSourceReadHref("https://steveoak.com/work/ecosmartloop/#a"), "https://steveoak.com/api/md/work/ecosmartloop");
  assert.equal(actions.oakSourceReadHref("https://steveoak.com/"), "https://steveoak.com/api/md");
  assert.equal(actions.oakSourceReadHref("https://example.com/codex/legacy"), "https://example.com/codex/legacy", "other hosts keep their page");
  assert.equal(actions.oakSourceReadHref("/work/ecosmartloop"), "https://steveoak.com/api/md/work/ecosmartloop", "a site-relative citation does not throw");
  const prompt = actions.oakOpenInPrompt("Who built it?", answer);
  assert.match(prompt, /^Read from https:\/\/steveoak\.com\/api\/md\/work\/ecosmartloop and https:\/\/steveoak\.com\/api\/md\/work and https:\/\/example\.com\/codex\/legacy/);
  assert.match(prompt, /My question: Who built it\?$/);
  assert.match(actions.oakOpenInPrompt("", { kind: "document", claims: [] }), /llms\.txt/, "an answer without public sources points at the site summary");
  for (const provider of actions.oakOpenInProviders) assert.match(provider.href("x y"), /^https:\/\/[^/]+\/.*x%20y$/, provider.id);
});
