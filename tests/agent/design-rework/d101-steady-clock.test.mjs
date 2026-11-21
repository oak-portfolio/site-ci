import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { figureHarness, openHarness, repo } from "../openui-browser/figure-helpers.mjs";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

async function checkClock({ cpuThrottle }) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=reasoning-slow`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    await page.waitForFunction(() => ![...document.querySelectorAll(".oak-cot__clock .ui-rolling-number__slot")].some(slot => slot.querySelectorAll(".ui-rolling-number__digit").length > 1), null, { timeout: 3000 }); // Review v6 (intentional update): "at rest" waits out a tick that lands on ready.
    assert.match(await page.locator(".oak-cot__clock").innerText(), /^\d+s$/, "at rest it reads as one line: a number and its unit");
    if (cpuThrottle) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
    // Sample every frame across at least one tick; a frame mid-roll has two digits in the ones slot.
    const frames = await page.locator(".oak-cot__clock").evaluate(async node => {
      const seen = [];
      const started = performance.now();
      while (performance.now() - started < 2200) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const slot = [...node.querySelectorAll(".ui-rolling-number__slot")].at(-1), box = slot.getBoundingClientRect();
        const shown = [...slot.querySelectorAll(".ui-rolling-number__digit")].reduce((sum, digit) => {
          const rect = digit.getBoundingClientRect(), overlap = Math.max(0, Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top));
          return sum + overlap / box.height * Number(getComputedStyle(digit).opacity);
        }, 0);
        seen.push({ width: box.width, digits: slot.querySelectorAll(".ui-rolling-number__digit").length, shown });
      }
      return seen;
    });
    const rolling = frames.filter(frame => frame.digits > 1);
    assert.ok(rolling.length >= 2, `a tick was caught mid-roll (${rolling.length} frames)`);
    const widths = frames.map(frame => frame.width);
    assert.ok(Math.max(...widths) - Math.min(...widths) <= 1, `the ones slot keeps its width (${Math.min(...widths).toFixed(1)} to ${Math.max(...widths).toFixed(1)})`);
    const least = Math.min(...frames.map(frame => frame.shown));
    assert.ok(least >= 0.85, `every frame shows a whole digit's worth, never a blank slot (least ${least.toFixed(2)})`);
  } finally {
    await browser.close();
  }
}

test("D101-G1 the thinking clock rolls like an odometer: its slot keeps its width and always shows one whole digit's worth", () => checkClock({ cpuThrottle: 0 }));

test("D101-G1 a slow phone (CPU throttled 6x) still shows one whole digit's worth every frame", () => checkClock({ cpuThrottle: 6 }));

// Ticket 116 (r112 review r1): a tick that lands mid-roll hands the leaving digit the offset the arriving one had reached.
const roller = `
import * as React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { RollingNumber } from "@/components/ui/rolling-number";
const root = createRoot(document.getElementById("root")!);
const draw = (value: number) => flushSync(() => root.render(<RollingNumber value={value} />));
draw(1);
Object.assign(window, { draw });
document.documentElement.dataset.ready = "true";
`;

test("116 a tick that lands mid-roll keeps the leaving digit where the arriving one had reached", async () => {
  const browser = await chromium.launch();
  const { page, close } = await openHarness(browser, await figureHarness(roller));
  try {
    await page.addStyleTag({ content: readFileSync(path.join(repo, "src/styles/ui.css"), "utf8") });
    await page.evaluate(() => window.draw(2));
    await page.waitForTimeout(110);
    const offsets = await page.evaluate(() => {
      const shift = digit => Number(/(-?[\d.]+)%/.exec(digit.style.transform)?.[1] ?? 0);
      const slot = document.querySelector(".ui-rolling-number__slot");
      const arriving = shift(slot.querySelector(".ui-rolling-number__digit:not([data-leaving])"));
      window.draw(3);
      const leaving = shift(slot.querySelector(".ui-rolling-number__digit[data-leaving]"));
      return { arriving, leaving, shown: slot.querySelector("[data-leaving]").textContent };
    });
    assert.ok(Math.abs(offsets.arriving) > 10, `the first roll is mid-way (${offsets.arriving}%)`);
    assert.equal(offsets.shown, "2");
    assert.ok(Math.abs(offsets.leaving - offsets.arriving) < 1, `the leaving digit starts at ${offsets.leaving}%, not at ${offsets.arriving}%`);
  } finally {
    await close();
    await browser.close();
  }
});
