import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const siteUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D15-G1 the launcher shows one AI-chat icon and no Oak sprite, so the mascot above is the only Oak", () => {
  const source = readFileSync(path.join(root, "src/components/agent/OakWorkspace.tsx"), "utf8");
  const launcher = source.slice(source.indexOf("data-oak-workspace-launcher"), source.indexOf("</Button>", source.indexOf("data-oak-workspace-launcher")));
  assert.match(launcher, /<Icon name="aiChat"/);
  assert.doesNotMatch(launcher, /OakSprite/);
});

let collected;
/** One browser walk over the homepage, shared by D15-G2 and D15-G3: each distinct mascot line in order. */
function mascotLines() {
  collected ??= (async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(`${siteUrl}/`, { waitUntil: "networkidle" });
      await page.waitForSelector("[data-oak-workspace-launcher]");
      const lines = [];
      for (let step = 0; step < 40 && lines.length < 6; step += 1) {
        await page.mouse.wheel(0, step % 8 < 4 ? 700 : -700);
        await page.waitForTimeout(1400);
        const line = await page.evaluate(() => ({
          text: document.querySelector(".oak-mascot__message-text")?.textContent ?? "",
          context: document.querySelector(".oak-mascot__bubble")?.dataset.context,
          header: document.querySelector(".oak-mascot__message strong")?.textContent ?? null,
          nudge: document.documentElement.hasAttribute("data-oak-invite"),
        }));
        if (line.text && lines.at(-1)?.text !== line.text) lines.push(line);
      }
      return lines;
    } finally {
      await browser.close();
    }
  })();
  return collected;
}

test("D15-G2 Oak speaks to the visitor without a host header above his lines", async () => {
  const lines = await mascotLines();
  assert.ok(lines.length >= 3, `collected ${lines.length} lines`);
  for (const line of lines) assert.equal(line.header, null, `no host header above "${line.text}"`);
});

test("D15-G3 every third line invites the visitor to Oak AI Agent and nudges the launcher, never the welcome", async () => {
  const lines = await mascotLines();
  const invites = lines.filter(line => line.context === "oak.agent-invite");
  assert.ok(invites.length >= 1, "an invite line appears between page notes");
  for (const invite of invites) {
    assert.match(invite.text, /Oak AI Agent|Ask me|ask me/, invite.text);
    assert.ok(invite.nudge, "the launcher nudges while an invite shows");
  }
  assert.notEqual(lines[0].context, "oak.agent-invite", "the welcome line is never an invite");
});

test("D15-G3 after an invite the page's own notes carry on by themselves", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${siteUrl}/`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-oak-workspace-launcher]");
    const context = () => page.evaluate(() => document.querySelector(".oak-mascot__bubble")?.dataset.context ?? null);
    let invite = false;
    for (let step = 0; step < 40 && !invite; step += 1) {
      await page.mouse.wheel(0, step % 8 < 4 ? 700 : -700);
      await page.waitForTimeout(1400);
      invite = (await context()) === "oak.agent-invite";
    }
    assert.ok(invite, "an invite line appeared");
    // Hands off: the invite is read, then the page's notes resume on their own (a note is read for 12s).
    await page.waitForFunction(() => document.querySelector(".oak-mascot__bubble")?.dataset.context !== "oak.agent-invite", null, { timeout: 25000 });
    const next = await context();
    assert.ok(next && next !== "oak.agent-invite", `the rotation moved on to ${next}`);
  } finally {
    await browser.close();
  }
});

test("D15-G4 the launcher ring turns and its icon tilts on hover, and both hold still under reduced motion", async () => {
  const css = readFileSync(path.join(root, "src/styles/oakAgent.css"), "utf8");
  const markup = `<div class="oak-workspace-launcher"><button class="ui-button" data-oak-workspace-launcher>
    <svg class="oak-workspace-launcher__icon" width="18" height="18"></svg><span>Oak AI Agent</span></button></div>`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ reducedMotion: "no-preference" });
    await page.setContent(`<style>:root { --motion-quick: 160ms; --motion-mode: 240ms; --motion-standard: cubic-bezier(0.22, 1, 0.36, 1); --panel: #0c0c0c; --radius-pill: 999px; } ${css}</style>${markup}`);
    const read = () => page.evaluate(() => {
      const ring = getComputedStyle(document.querySelector(".oak-workspace-launcher"));
      const icon = getComputedStyle(document.querySelector(".oak-workspace-launcher__icon"));
      return { ring: ring.animationName, icon: icon.transform, iconTransition: icon.transitionDuration };
    });
    let state = await read();
    assert.equal(state.ring, "oak-launcher-turn", "the gradient ring turns at normal motion");
    assert.equal(state.iconTransition, "0.24s");
    await page.hover("button");
    await page.waitForTimeout(400);
    state = await read();
    assert.notEqual(state.icon, "none", "hover tilts the AI icon");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.mouse.move(0, 0);
    await page.focus("button");
    state = await read();
    assert.equal(state.ring, "none", "reduced motion stops the ring");
    assert.equal(state.icon, "none", "reduced motion keeps the icon still");
    assert.equal(state.iconTransition, "0s");
  } finally {
    await browser.close();
  }
});
