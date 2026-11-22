import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
const root = path.resolve(import.meta.dirname, "../../..");
const read = file => readFileSync(path.join(root, file), "utf8");
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "fixture", hardPolicyVersion: "fixture", knowledgeRevision: "fixture",
  operations: ["search", "read"], kind: "sourced", acknowledgment: null,
  claims: [{ id: "ownership", text: "Steve owned the app around the classifier.", citations: [{ documentId: "work:ecosmartloop", passageId: "public-passage", sectionId: "ownership", url: "https://steveoak.com/work/ecosmartloop/#ownership" }] }] };
const completed = { id: "answer-message", role: "assistant", text: "", answer, cards: [], usage: null, state: "complete", page: "/" };

test("D12-G2 a completed turn is announced once through one polite live region", () => {
  const { collectOakOutputAnnouncements, oakOutputUnitKeys, OakOutputAnnouncements } = loadTsx("src/components/agent/OakTranscript.tsx");
  const announced = new Set();
  assert.equal(collectOakOutputAnnouncements([completed], announced), "Oak answered. Steve owned the app around the classifier.");
  assert.equal(collectOakOutputAnnouncements([structuredClone(completed)], announced), "", "a rerender of the same turn stays quiet");
  assert.equal(collectOakOutputAnnouncements([completed], new Set(oakOutputUnitKeys([completed]))), "", "reopening the workspace stays quiet");
  const region = renderToStaticMarkup(React.createElement(OakOutputAnnouncements, { messages: [] }));
  assert.match(region, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(read("src/components/agent/OakTranscript.tsx"), /className="oak-conversation__content" role="list" aria-live="off"/, "the transcript list itself does not announce the turn a second time");
});

test("D12-G3 a panel heading takes focus when it opens and Escape returns focus to its button", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=empty`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    // PR 1d (intentional update): Dictate opens a strip inside the box, not a panel; its Escape and focus return are tested in composer-1d.test.mjs (PR1D-G7).
    for (const [trigger, title] of [["Attach documents", "Private documents"]]) {
      await page.getByRole("button", { name: trigger, exact: true }).click();
      await page.waitForFunction(() => document.activeElement?.matches(".oak-workflow h2"), null, { timeout: 5000 });
      assert.equal(await page.evaluate(() => document.activeElement.textContent), title);
      await page.keyboard.press("Escape");
      await page.waitForFunction(label => document.activeElement?.getAttribute("aria-label") === label, trigger, { timeout: 5000 });
      assert.equal(await page.locator(".oak-workflow").count(), 0, `${title} closed`);
      assert.ok(await page.getByRole("dialog").isVisible(), "the workspace stays open");
    }
  } finally {
    await browser.close();
  }
});

test("D12-G4 icon-only controls have names", () => {
  let iconOnly = 0;
  for (const dir of ["src/components/agent", "src/components/ui"]) {
    for (const name of readdirSync(path.join(root, dir)).filter(file => file.endsWith(".tsx"))) {
      for (const line of read(`${dir}/${name}`).split("\n").filter(text => /size="icon[^"]*"/.test(text))) {
        iconOnly++;
        assert.match(line, /aria-label=/, `${name}: ${line.trim().slice(0, 140)}`);
      }
    }
  }
  assert.ok(iconOnly >= 8, `checked ${iconOnly} icon-only controls`);
});
