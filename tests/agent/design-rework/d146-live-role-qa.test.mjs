import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTsx } from "./load-tsx.mjs";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

// D146: live role-fit QA on 2026-10-15 showed an evidence quote that was a raw Markdown table row from a case study.
test("D146-G1 a quoted table row reads as cells, and ordinary quotes keep their pipes", () => {
  const { plainQuote } = loadTsx("src/lib/oakQuote.ts");
  assert.equal(plainQuote("Flat UI | Improved | Figma Make, explicit design specs, and Motion Plus helped the app feel designed."),
    "Flat UI \u00b7 Improved \u00b7 Figma Make, explicit design specs, and Motion Plus helped the app feel designed.");
  assert.equal(plainQuote("| AI chat UI | Implemented | Vercel AI SDK and AI Elements |"), "AI chat UI \u00b7 Implemented \u00b7 Vercel AI SDK and AI Elements");
  assert.equal(plainQuote("Use a | b when piping."), "Use a | b when piping.", "one pipe is just text");
  assert.equal(plainQuote("Steve Oak wrote: \u201cScanner | Shipped | Mobile shell\u201d"), "Scanner \u00b7 Shipped \u00b7 Mobile shell");
  const { quoteParts } = loadTsx("src/lib/oakQuote.ts");
  assert.equal(quoteParts("Steve Oak wrote: \u201cArea | Status | Detail | \n Mobile cache | Resolved\u201d").quote,
    "Area \u00b7 Status \u00b7 Detail \u00b7 Mobile cache \u00b7 Resolved", "answer and advice quote blocks read the same way");
});

test("D146-G2 a quoted source in an answer shows as a quote block, never as \"Steve Oak wrote:\"", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=answer-points`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const result = await page.evaluate(async () => {
      const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
      const workspace = await import(find("src/lib/oakWorkspace"));
      const quote = "I design and build useful AI products: workflows, eval loops, tool systems, and interfaces.";
      const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "fixture", hardPolicyVersion: "fixture", knowledgeRevision: "fixture",
        operations: ["search", "read"], kind: "gap", acknowledgment: "Your document does not verify Steve's experience.",
        claims: [{ id: "c1", text: `Steve Oak wrote: \u201c${quote}\u201d`, citations: [{ documentId: "page:home", passageId: "p1", sectionId: "intro", url: "https://steveoak.com/#intro" }] }] };
      const turn = crypto.randomUUID(), base = { cards: [], usage: null, state: "complete", page: "/", research: null, taskKind: "question" };
      workspace.setOakWorkspaceFixture({ conversationId: crypto.randomUUID(), pending: false, error: null, messages: [
        { ...base, id: `${turn}:user`, role: "user", text: "Which projects relate?", answer: null },
        { ...base, id: turn, role: "assistant", text: "", answer }] });
      await new Promise(resolve => setTimeout(resolve, 800));
      const point = [...document.querySelectorAll(".oak-answer__point")].at(-1);
      return { quote, block: point?.querySelector("blockquote.oak-quote")?.textContent?.trim() ?? null, text: point?.textContent ?? "" };
    });
    assert.equal(result.block, result.quote, "the quote stands alone in a quote block");
    assert.ok(!/wrote:/.test(result.text), `no third-person lead-in: ${result.text}`);
  } finally {
    await browser.close();
  }
});
