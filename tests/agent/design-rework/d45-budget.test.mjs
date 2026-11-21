import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
const workspace = loadTsx("src/lib/oakWorkspace.ts");
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D45-G1 a sponsor budget refusal reads as this month's pause, never as the visitor's answers, with no Retry or sign-in", async () => {
  for (const error of ["budget-exhausted", "pricing-envelope-breached"]) {
    globalThis.fetch = async url => url === "/api/oak/chat" ? Response.json({ error }, { status: 429 }) : new Response("{}", { status: 503 });
    workspace.setOakWorkspaceFixture({ presentation: "human-agent", viewportSupported: true, messages: [], pending: false, error: null, draft: "What has Steve built?" });
    await workspace.submitOakTurn();
    const state = workspace.getOakWorkspace();
    assert.equal(state.messages.at(-1).failure, "budget", error);
    assert.match(state.error, /this month's free answers/);
    assert.doesNotMatch(state.error, /you have used/i);
    // Q03-G5 (intentional update): asking again meets the same ceiling, so the stale question leaves the box; it stays above.
    assert.equal(state.draft, "", "the stale question leaves the box");
    assert.equal(state.messages.at(-2).text, "What has Steve built?");
    assert.equal(workspace.oakRetryKind(state, state.messages.at(-1).id), null, "asking again meets the same ceiling");
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=budget-paused`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const card = page.locator('.oak-turn__stopped[data-failure="budget"]');
    await card.waitFor();
    const text = await card.innerText();
    assert.match(text, /this month's free answers/);
    assert.doesNotMatch(text, /you have used|Oak AI|Steve Oak|the agent/i, "Oak speaks to the visitor about its own budget");
    assert.equal(await card.getByRole("button", { name: /Retry|Sign in/ }).count(), 0);
    assert.equal(await card.getByRole("button", { name: "Contact Steve" }).count(), 1);
    // Q13 (intentional update): a spent budget offers one way forward, Contact Steve; no other-assistant links.
    assert.equal(await card.getByRole("link", { name: /^Ask in / }).count(), 0, "one action only");
    assert.equal(await card.locator('[data-pose="budget-paused"]').count(), 1, "the sleeping pouch art");
    await card.screenshot({ path: "/tmp/d45-budget-card.png" });
  } finally {
    await browser.close();
  }
});
