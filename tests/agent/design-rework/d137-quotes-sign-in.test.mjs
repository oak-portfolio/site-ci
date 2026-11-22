import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

// D137: staged quote chips survive the sign-in redirect, except a quote from a private document turn, which stays behind.
// The turn uses a real validated advice answer from the live Worker (2026-10-14), so the strict handoff schema accepts it.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const answer = JSON.parse(readFileSync(new URL("./fixtures/live-advice-answer.json", import.meta.url), "utf8"));
const run = (page, fn, arg) => page.evaluate(async ([source, value]) => {
  const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
  const modules = { workspace: await import(find("src/lib/oakWorkspace")), handoff: await import(find("src/lib/oakAuthHandoff")),
    output: await import(find("packages/oak-agent-contracts/src/output")) };
  return new Function("m", "value", `return (${source})(m, value);`)(modules, value);
}, [fn.toString(), arg]);
// One public advice turn, optionally marked as a private document turn.
const seed = (page, privateTurn) => run(page, ({ workspace, output }, value) => {
  const turn = crypto.randomUUID(), now = Date.now();
  const base = { cards: [], usage: null, state: "complete", page: "/", research: null };
  workspace.setOakWorkspaceFixture({ conversationId: crypto.randomUUID(), quotes: [], messages: [
    { ...base, id: `${turn}:user`, role: "user", text: "We have two months for an MVP. What should we cut first?", answer: null, taskKind: "advice",
      ...(value.privateTurn ? { privateDocumentTurn: true } : {}) },
    { ...base, id: turn, role: "assistant", text: output.renderOakAnswer(value.answer), answer: value.answer, startedAt: now }] });
  return turn;
}, { answer, privateTurn });

test("D137-G1 staged quotes survive the sign-in handoff with their source; a private turn's quote is left behind", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=answer-points`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const turn = await seed(page, false);
    const kept = await run(page, ({ workspace, handoff }, source) => {
      workspace.addOakQuote("Clarify the decision and seek a source", source);
      workspace.addOakQuote("Every point ends with a source");
      const saved = handoff.saveOakAuthHandoff(workspace.getOakWorkspace());
      return { saved, quotes: handoff.readOakAuthHandoff()?.quotes ?? null };
    }, turn);
    assert.equal(kept.saved, true, "the handoff saves");
    assert.deepEqual(kept.quotes.map(quote => [quote.text, quote.source ?? null]),
      [["Clarify the decision and seek a source", turn], ["Every point ends with a source", null]], "both quotes come back in order");
    assert.ok(kept.quotes.every(quote => typeof quote.id === "string" && quote.id.length > 8), "with fresh chip ids");
    const privateTurn = await seed(page, true);
    const dropped = await run(page, ({ workspace, handoff }, source) => {
      workspace.addOakQuote("Clarify the decision and seek a source", source);
      workspace.addOakQuote("Every point ends with a source");
      const saved = handoff.saveOakAuthHandoff(workspace.getOakWorkspace()), read = handoff.readOakAuthHandoff();
      return { saved, restored: read !== null, quotes: read?.quotes ?? [] };
    }, privateTurn);
    assert.deepEqual(dropped, { saved: true, restored: true, quotes: [] }, "the draft still travels; no quote from the private turn, and no unsourced quote, goes with it");
  } finally {
    await browser.close();
  }
});
