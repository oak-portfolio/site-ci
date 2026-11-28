import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

// Ticket 283: closing the agent never moves the page behind, even when the page under it changed while it was open (a
// move to a longer page, or a resize that changes whether the page scrolls). Proved on classic scrollbars only.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

// macOS draws overlay scrollbars unless Chrome is told otherwise, and Playwright refuses that flag at launch. Elsewhere
// Playwright's headless default --hide-scrollbars would draw none, so it is dropped.
async function classicBrowser() {
  if (process.platform !== "darwin") return { browser: await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] }), stop: () => {} };
  const dir = mkdtempSync(join(tmpdir(), "oak-283-"));
  const chrome = spawn(chromium.executablePath(), ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${dir}`,
    "--no-first-run", "--no-default-browser-check", "-AppleShowScrollBars", "Always"], { stdio: "ignore" });
  let port = 0;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = Number(readFileSync(join(dir, "DevToolsActivePort"), "utf8").split("\n")[0]); } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  return { browser, stop: () => { chrome.kill(); rmSync(dir, { recursive: true, force: true }); } };
}

const withPage = async run => {
  const { browser, stop } = await classicBrowser();
  try {
    const context = browser.contexts()[0] ?? await browser.newContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await run(page);
  } finally { await browser.close().catch(() => {}); stop(); }
};

const reading = page => page.evaluate(() => {
  const root = document.documentElement, probe = document.createElement("div");
  probe.style.cssText = "position:absolute;width:100px;height:100px;overflow:scroll";
  document.body.append(probe);
  const scrollbar = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return { path: location.pathname, open: root.dataset.oakPresentation === "human-agent", scrollbar,
    content: Math.round(document.body.getBoundingClientRect().width * 10) / 10 };
});
const settle = page => page.waitForTimeout(1200);
const openAgent = async page => {
  await page.getByRole("button", { name: /Oak AI Agent/ }).first().click();
  await page.waitForFunction(() => document.documentElement.dataset.oakPresentation === "human-agent");
  await settle(page);
};
const closeAgent = async page => {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.documentElement.dataset.oakPresentation !== "human-agent");
  await settle(page);
};
const shorten = page => page.evaluate(() => {
  for (const node of document.querySelectorAll(".route-surface > :is(main, section, footer)")) node.style.display = "none";
  return document.documentElement.scrollHeight <= innerHeight;
});

test("283 a move inside the open agent from a short page to a long one: closing keeps the page's width", () => withPage(async page => {
  await page.goto(`${galleryUrl}/work`, { waitUntil: "networkidle" });
  await page.locator(".site-header a[href='/']").first().click();
  await page.waitForURL(`${galleryUrl}/`);
  await settle(page);
  assert.ok(await shorten(page), "the first page fits the window");
  await openAgent(page);
  await page.goBack();
  await page.waitForURL(`${galleryUrl}/work`);
  await settle(page);
  const open = await reading(page);
  assert.ok(open.scrollbar > 0, "classic scrollbars");
  assert.ok(open.open, "the agent stays open across the move");
  await closeAgent(page);
  const after = await reading(page);
  assert.equal(after.content, 1280 - open.scrollbar, "the long page shows its scrollbar after close");
  assert.equal(open.content, after.content, "the page behind keeps its width on close");
}));

test("283 a resize while open that ends the page's scrolling: closing keeps the page's width", () => withPage(async page => {
  await page.goto(`${galleryUrl}/`, { waitUntil: "networkidle" });
  await settle(page);
  await openAgent(page);
  assert.ok(await shorten(page), "the page fits the window");
  await page.setViewportSize({ width: 1280, height: 820 });
  await settle(page);
  const open = await reading(page);
  assert.ok(open.scrollbar > 0, "classic scrollbars");
  await closeAgent(page);
  const after = await reading(page);
  assert.equal(after.content, 1280, "the short page shows no scrollbar after close");
  assert.equal(open.content, after.content, "the page behind keeps its width on close");
}));

test("283 a long page keeps its width on open and on close", () => withPage(async page => {
  await page.goto(`${galleryUrl}/`, { waitUntil: "networkidle" });
  await settle(page);
  const before = await reading(page);
  assert.ok(before.scrollbar > 0, "classic scrollbars");
  await openAgent(page);
  const open = await reading(page);
  await closeAgent(page);
  const after = await reading(page);
  assert.deepEqual([open.content, after.content], [before.content, before.content], "no shift on open or close");
}));
