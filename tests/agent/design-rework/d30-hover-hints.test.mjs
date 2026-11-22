import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
// A hint waits out the workspace's open delay unless another hint closed just before it, and on a slow machine the
// next hover can arrive too late for that. The 400 ms is the hint's own budget, so every hover gets the delay on top.
const openDelay = 200;

// Icon-only controls carry no visible words, so each must name itself on hover. Links and buttons with text are exempt.
const iconOnly = () => [...document.querySelectorAll(".oak-workspace button, .oak-workspace a")].filter(node => {
  const box = node.getBoundingClientRect();
  const visibleText = [...node.childNodes].some(child => child.nodeType === 3 ? child.textContent.trim()
    : child.nodeType === 1 && !child.classList.contains("sr-only") && child.tagName !== "svg" && child.tagName !== "IMG" && child.textContent.trim() && getComputedStyle(child).display !== "none");
  // An inert control (the idle Latest arrow, faded out) cannot be hovered and is skipped.
  return box.width > 0 && box.height > 0 && !visibleText && !node.closest(".oak-message__sources, [data-slot=suggestion], [inert]")
    && getComputedStyle(node).visibility !== "hidden";
}).map((node, index) => { node.dataset.hintProbe = String(index); return node.getAttribute("aria-label") ?? node.textContent.trim(); });

test("D30-G1 every icon-only control names itself on hover within 400 ms, disabled Send included", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const missing = [];
    for (const state of ["empty", "composing", "answer-sourced", "follow-ups", "thinking"]) {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
      await page.waitForTimeout(500);
      const names = await page.evaluate(iconOnly);
      assert.ok(names.length >= 3, `${state} has icon controls`);
      for (const [index, name] of names.entries()) {
        await page.mouse.move(2, 2);
        await page.waitForTimeout(120);
        await page.locator(`[data-hint-probe="${index}"]`).hover();
        const shown = await page.waitForFunction(() => [...document.querySelectorAll(".ui-tooltip-content")]
          .some(tip => getComputedStyle(tip).opacity !== "0" && tip.textContent.trim()), null, { timeout: openDelay + 400 }).then(() => true, () => false);
        if (!shown) missing.push(`${state}: ${name}`);
      }
    }
    assert.deepEqual(missing, [], "controls without a hover hint");
    await page.goto(`${galleryUrl}/__dev/oak-states?state=empty`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Send", exact: true }).hover();
    await page.waitForFunction(() => document.querySelector(".ui-tooltip-content")?.textContent.includes("Type a question to send"), null, { timeout: openDelay + 400 });
    const delay = Number(readFileSync("src/components/agent/OakWorkspace.tsx", "utf8").match(/<TooltipProvider delay=\{(\d+)\}/)?.[1]);
    assert.ok(delay <= openDelay, `the workspace hint delay is ${delay} ms, over the ${openDelay} ms each hover is given`);
  } finally {
    await browser.close();
  }
});
