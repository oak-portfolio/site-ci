import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(500);
};
// The page's own documents controller (same Vite module instance), so the test drives what the panel renders.
const documents = (page, next) => page.evaluate(async value => {
  const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => /\/src\/lib\/oakDocumentsWorkspace\.ts(\?|$)/.test(name));
  (await import(url)).getOakDocumentsController().setFixture(value);
}, next);
const steps = page => page.locator(".oak-documents__steps li").evaluateAll(rows => rows.map(row => ({
  state: row.dataset.state, label: row.firstElementChild.nextElementSibling.firstChild.textContent, count: row.querySelector(".oak-documents__step-count")?.textContent ?? null,
  centre: (() => { const [node, text] = [row.children[0], row.children[1]].map(child => { const box = child.getBoundingClientRect(); return box.top + box.height / 2; }); return Math.abs(node - text); })() })));

test("D82-G1 while files are prepared the panel lists the real stages as task rows: done, the running one with its count, then waiting", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "document-parsing");
    const rows = await steps(page);
    assert.deepEqual(rows.map(row => row.label), ["Upload privately", "Check each file", "Check them together", "Extract the text", "Finish the preview"]);
    assert.deepEqual(rows.map(row => row.state), ["done", "done", "done", "running", "pending"]);
    assert.equal(rows[3].count, "1 of 1", "the running stage says how far along it is");
    assert.ok(rows.every(row => row.centre <= 2), "each node and its words share a centre line");
    assert.equal(await page.locator(".oak-documents__status .ui-spinner").count(), 0, "one loader for the run: the status line hands it to the running row");
    assert.equal(await page.locator(".oak-documents__steps .ui-spinner").count(), 1, "the running row carries it");
    assert.notEqual(await page.locator(".oak-documents__steps li[data-state='running'] .ui-spinner").evaluate(node => getComputedStyle(node).color),
      await page.locator(".oak-documents__status").evaluate(node => getComputedStyle(node).color), "the running row's pixels are violet, not the muted line colour");

    await documents(page, { phase: "Checking document 2 of 3" });
    assert.deepEqual((await steps(page)).map(row => `${row.state}${row.count ? ` ${row.count}` : ""}`), ["done", "running 2 of 3", "pending", "pending", "pending"], "a new phase moves the rows");
    // A phase the stages do not describe (scanned-page reading) keeps the single status line only.
    await documents(page, { phase: "Processing the confirmed whole PDF. Usage remains provisional." });
    assert.equal(await page.locator(".oak-documents__steps").count(), 0, "no invented stages");
    await documents(page, { pending: false, phase: "Preview ready. Choose the sections Oak should read." });
    assert.equal(await page.locator(".oak-documents__steps").count(), 0, "the rows leave once preparation ends");

    // A quick preparation never flashes the rows: they wait about a third of a second before showing.
    await documents(page, { pending: true, phase: "Preparing documents" });
    await page.waitForTimeout(120);
    assert.equal(await page.locator(".oak-documents__steps").count(), 0, "not yet at 120ms");
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".oak-documents__steps").count(), 1, "shown once preparation takes a moment");
  } finally {
    await browser.close();
  }
});
