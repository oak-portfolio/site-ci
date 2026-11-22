import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

const { OakContactBriefEditor } = loadTsx("src/components/agent/OakContactBriefEditor.tsx");
const { collectOakOutputAnnouncements } = loadTsx("src/components/agent/OakTranscript.tsx");
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);
};
// The page's own store module, so the test drives the same state the workspace renders (see D74).
const store = (page, fn, arg) => page.evaluate(async ([source, value]) => {
  const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => /\/src\/lib\/oakWorkspace\.ts(\?|$)/.test(name));
  const workspace = await import(url);
  return new Function("workspace", "value", `return (${source})(workspace, value);`)(workspace, value);
}, [fn.toString(), arg]);
const failTurn = (page, panel) => store(page, (workspace, open) => {
  const messages = workspace.getOakWorkspace().messages;
  workspace.setOakWorkspaceFixture({ pending: false, error: workspace.oakTurnFailedNotice,
    ...(open ? { panel: "role", roleDraft: { roleDescription: "Senior Design Engineer, AI products.", intent: "Compare" } } : { panel: null, roleDraft: null }),
    messages: [...messages, { id: "d96-q", role: "user", text: "Compare this role.", cards: [] },
      { id: "d96-a", role: "assistant", text: "", cards: [], state: "failed", steps: [] }] });
}, panel);

test("D96-G1 a turn that fails while a panel covers the transcript shows its error in the panel's view; in chat the stopped card carries it alone", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "long-conversation");
    await failTurn(page, true);
    await page.waitForSelector(".oak-workflow h2");
    await page.waitForTimeout(400);
    const shown = await page.evaluate(notice => {
      const line = [...document.querySelectorAll(".oak-workspace__status, .sr-only")].find(node => node.textContent.includes(notice));
      const frame = document.querySelector(".oak-workspace__reading").getBoundingClientRect(), box = line?.getBoundingClientRect();
      return { found: !!line, visible: !!line && !line.classList.contains("sr-only") && box.height > 0, inside: !!box && box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1 };
    }, "The answer could not finish");
    assert.ok(shown.found, "the failure is announced");
    assert.ok(shown.visible, "with the panel open, the failure line is visible, not screen-reader only");
    assert.ok(shown.inside, "and it sits inside the reading area, not under the action bar");

    await open(page, "long-conversation");
    await failTurn(page, false);
    await page.waitForSelector('[data-message-id="d96-a"]');
    const chat = await page.evaluate(notice => [...document.querySelectorAll(".oak-workspace__status, .sr-only")].find(node => node.textContent.includes(notice))?.className ?? "", "The answer could not finish");
    // Q03-G4 (intentional update): in chat the stopped card says it, and the transcript's one live region announces it,
    // so no status line, visible or sr-only, repeats the notice.
    assert.equal(chat, "", "in chat no second line repeats the stopped card");
    assert.equal(await page.locator('[data-message-id="d96-a"] .oak-turn__stopped').count(), 1, "the stopped card carries it");
  } finally {
    await browser.close();
  }
});

test("D96-G2 review fixes: the selection bar is one tab stop with arrow keys, and Oak speaks in the first person", async () => {
  const brief = renderToStaticMarkup(createElement(OakContactBriefEditor, { draft: { goals: "g", constraints: "", startDateQuestion: "", references: [], text: "", needsFormat: false }, references: [], error: null }));
  assert.doesNotMatch(brief, /Oak's answers/, "the brief speaks in the first person");
  const quoted = { id: "a", role: "assistant", text: "", cards: [], usage: null, state: "complete", answer: { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "f", hardPolicyVersion: "f", knowledgeRevision: "f", operations: [], kind: "sourced", acknowledgment: null,
    claims: [{ id: "c", text: "Steve Oak wrote: \u201cI design and build useful AI products.\u201d", citations: [{ documentId: "work:x", passageId: "p", sectionId: "s", url: "https://steveoak.com/work/x/" }] }] } };
  assert.equal(collectOakOutputAnnouncements([quoted], new Set()), "Oak answered. I design and build useful AI products.", "the announcement reads the quote, not a third-person lead-in");
  // Live role fit (October 13): the quote sits on its own line inside a multi-line paragraph.
  const roleFit = { ...quoted, id: "r", answer: { ...quoted.answer, kind: "role-fit", rows: [{ id: "r1", requirement: { text: "Senior Design Engineer, AI products.", start: 0, end: 36 }, status: "demonstrated",
    evidence: [{ id: "r1-e", text: "Steve Oak wrote: \u201cI design and build useful AI products.\u201d", citations: quoted.answer.claims[0].citations }], gap: null, questions: [] }], contactTopics: [] } };
  const spoken = collectOakOutputAnnouncements([roleFit], new Set());
  assert.doesNotMatch(spoken, /Steve( Oak)? wrote/, `a role-fit announcement has no third-person lead-in either (${spoken.slice(0, 160)})`);
  assert.match(spoken, /I design and build useful AI products\./);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "answer-points");
    await page.evaluate(() => {
      const node = document.querySelector(".oak-turn__answer .oak-answer__point p"), text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange();
      range.setStart(text, 0); range.setEnd(text, Math.min(24, text.textContent.length));
      document.getSelection().removeAllRanges(); document.getSelection().addRange(range);
    });
    const toolbar = page.getByRole("toolbar", { name: "Selected text" });
    await toolbar.waitFor({ timeout: 3000 });
    await toolbar.getByRole("button", { name: "Ask about this" }).focus();
    await page.keyboard.press("ArrowRight");
    // Explain simply sits between them since D3 turned it on (2026-11-04).
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Explain simply", "ArrowRight moves focus to Explain simply");
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Copy", "a second ArrowRight moves focus to Copy");
    assert.equal(await toolbar.locator('button[tabindex="0"]').count(), 1, "one tab stop");

    assert.doesNotMatch(await page.content(), /Oak answers questions/, "the dialog describes itself in the first person");
  } finally {
    await browser.close();
  }
});
