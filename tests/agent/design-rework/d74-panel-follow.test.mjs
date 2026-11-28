import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);
};
// The page's own store module (Vite serves one instance per URL), so the test drives the same state the workspace renders.
const store = (page, fn, arg) => page.evaluate(async ([source, value]) => {
  // Vite tags the module with a timestamp; import that exact URL to share the page's instance.
  const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => /\/src\/lib\/oakWorkspace\.ts(\?|$)/.test(name));
  const workspace = await import(url);
  return new Function("workspace", "value", `return (${source})(workspace, value);`)(workspace, value);
}, [fn.toString(), arg]);

test("D74-G1 a turn sent from a panel is followed when the transcript returns; returning without sending keeps the reader's place", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "long-conversation");
    const scrollTop = () => page.evaluate(() => Math.round(document.querySelector(".oak-conversation__viewport").scrollTop));
    // Mid-transcript, not the top: a remount with a lost position also lands at the top, so the top proves nothing.
    const middle = await page.evaluate(() => {
      const v = document.querySelector(".oak-conversation__viewport");
      v.scrollTop = Math.round((v.scrollHeight - v.clientHeight) / 2);
      v.dispatchEvent(new Event("scroll"));
      return Math.round(v.scrollTop);
    });
    assert.ok(middle > 120, `the transcript is long enough to have a middle (${middle})`);
    await page.waitForTimeout(300);

    // Open a panel and come back without sending: the reader's place stays.
    await store(page, workspace => workspace.setOakWorkspaceFixture({ panel: "role", roleDraft: { roleDescription: "Design engineer", intent: "Compare" } }));
    await page.waitForSelector(".oak-workflow h2");
    await store(page, workspace => workspace.setOakWorkspaceFixture({ panel: null, roleDraft: null }));
    await page.waitForSelector(".oak-conversation__viewport");
    await page.waitForTimeout(500);
    const back = await scrollTop();
    assert.ok(Math.abs(back - middle) < 40, `returning without a new turn keeps the place (${back} vs ${middle})`);

    // Open the panel again and send from it: the new turn arrives while the transcript is away.
    await store(page, workspace => workspace.setOakWorkspaceFixture({ panel: "role", roleDraft: { roleDescription: "Design engineer", intent: "Compare" } }));
    await page.waitForSelector(".oak-workflow h2");
    await store(page, workspace => {
      const messages = workspace.getOakWorkspace().messages;
      workspace.setOakWorkspaceFixture({ panel: null, roleDraft: null, pending: true, progress: "Reading your question", messages: [...messages,
        { id: "d74-question", role: "user", text: "Compare this role with Steve's work.", cards: [] },
        { id: "d74-answer", role: "assistant", text: "", cards: [], state: "pending", steps: [{ id: "understand-0", operation: "understand", state: "running", startedAt: Date.now() }] }] });
    });
    await page.waitForSelector('[data-message-id="d74-answer"]');
    // 274: the pending turn keeps growing for ~400 ms after it mounts; wait for the follow to settle instead of one fixed look.
    await page.waitForFunction(() => {
      const viewport = document.querySelector(".oak-conversation__viewport");
      return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 48;
    }, null, { timeout: 3000, polling: 100 }).catch(() => {});
    const view = await page.evaluate(() => {
      const viewport = document.querySelector(".oak-conversation__viewport"), frame = viewport.getBoundingClientRect();
      const question = document.querySelector('[data-message-id="d74-question"]').getBoundingClientRect();
      return { top: Math.round(viewport.scrollTop), max: Math.round(viewport.scrollHeight - viewport.clientHeight), questionVisible: question.top >= frame.top - 1 && question.top < frame.bottom };
    });
    assert.ok(view.max - view.top <= 48, `the transcript follows the new turn to its live edge (${view.top} of ${view.max})`);
    assert.ok(view.questionVisible, "the question sent from the panel is in view");
  } finally {
    await browser.close();
  }
});

test("D74-G2 the Compare panel's selected document sections read as one row: tile, text and the change action share a centre line", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "role-fit");
    await store(page, workspace => workspace.setOakWorkspaceFixture({ roleDraft: { ...workspace.getOakWorkspace().roleDraft, roleDescription: "", requirementSource: { sourceIds: ["a", "b"] } } }));
    const row = await page.locator(".oak-role-intake__source").evaluate(node => ({
      centres: [...node.children].map(child => { const box = child.getBoundingClientRect(); return box.top + box.height / 2; }),
      tile: !!node.querySelector(".oak-group__icon svg"), action: node.querySelector("button")?.textContent }));
    assert.ok(row.tile, "the row leads with an icon tile");
    assert.equal(row.action, "Change selection");
    assert.ok(Math.max(...row.centres) - Math.min(...row.centres) <= 2, `one centre line (${row.centres.map(Math.round)})`);
  } finally {
    await browser.close();
  }
});

// D129 supersedes the empty row (Oak: the brief felt bloated): with no sources to pick, the references group is not drawn.
test("D75-G1 the contact brief's empty references group reads as one row: a link tile and its line share a centre", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "contact-brief");
    await store(page, workspace => workspace.setOakWorkspaceFixture({ messages: [] }));
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".oak-brief__references").count(), 0, "no empty references group");
    assert.equal(await page.locator("#oak-brief-goals").count(), 1, "the brief itself stays");
  } finally {
    await browser.close();
  }
});
