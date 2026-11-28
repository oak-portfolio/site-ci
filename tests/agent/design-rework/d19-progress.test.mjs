import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);
};
const withPage = async (run, options = {}) => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
    await run(await context.newPage());
  } finally {
    await browser.close();
  }
};

test("D19-G1 a settled answer folds its reasoning into one Thought for Ns summary that reopens and closes", () => withPage(async page => {
  await open(page, "answer-sourced");
  const summary = page.locator(".ui-chain-of-thought");
  assert.equal(await summary.count(), 1);
  const header = summary.locator(".ui-chain-of-thought__header");
  assert.match(await header.locator(".oak-cot__title").innerText(), /^Thought for \d+s$/);
  // D40: a sourced answer names its source count once, on the stack that closes it, not again in this header.
  assert.equal((await header.locator(".oak-cot__meta").innerText()).trim(), "");
  // With a single source the inline pill names it and no stack repeats it.
  assert.equal(await page.locator(".oak-turn__answer .oak-answer__stack").count(), 0);
  assert.equal(await summary.locator(".oak-cot__step").count(), 0, "steps start folded");
  await header.click();
  await summary.locator(".oak-cot__step").first().waitFor();
  assert.deepEqual(await summary.locator(".oak-cot__step").evaluateAll(steps => steps.map(step => step.dataset.kind)),
    ["understand", "search", "read", "weigh", "compose", "verify"], "every real step reopens in order");
  assert.ok(await summary.locator('.oak-cot__step[data-kind="search"] .oak-message__source').count() > 0, "the search names the sources it found");
  await header.click();
  await summary.locator(".oak-cot__steps").waitFor({ state: "detached", timeout: 3000 });
  await open(page, "tool-running");
  assert.equal(await page.locator('.ui-chain-of-thought[data-state="live"] .oak-cot__step').count(), 2, "a running turn keeps its live steps open");
}));

test("D19-G1 a completed answer whose current research failed still reads as checked, not stopped", () => {
  const { OakTurn } = loadTsx("src/components/agent/OakTurn.tsx");
  const cite = slug => ({ documentId: `work:${slug}`, passageId: "p", sectionId: "s", url: `https://steveoak.com/work/${slug}` });
  const answer = { kind: "sourced", knowledgeRevision: "r", claims: [{ id: "c", text: "t", citations: [cite("a"), cite("b")] }] };
  const steps = [{ id: "search-0", operation: "search", state: "done" }, { id: "research", operation: "research", state: "error" }];
  const header = state => renderToStaticMarkup(createElement(OakTurn, { message: { id: "m2", role: "assistant", text: "t", answer: state === "complete" ? answer : null,
    cards: [], usage: null, state, page: "/", steps }, question: "q", progress: "", contactPreference: null, retry: null, copied: null, onCopy() {}, onContact() {} }))
    .match(/<button[^>]*class="ui-chain-of-thought__header"[\s\S]*?<\/button>/)?.[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  assert.match(header("complete"), /^Finished 2 steps Current research unavailable/);
  assert.match(header("failed"), /^1 of 2 steps stopped/, "a failed turn still names its stopped step");
});

test("D19-G2 the running status label shimmers and is static under reduced motion", () => withPage(async page => {
  await open(page, "thinking");
  const label = page.locator(".oak-turn__shimmer");
  assert.equal(await label.evaluate(node => getComputedStyle(node).animationName), "oak-turn-shimmer");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await label.evaluate(node => getComputedStyle(node).animationName), "none");
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".oak-turn__shimmer")).color !== "rgba(0, 0, 0, 0)", null, { timeout: 2000 });
}));

test("D19-G3 copy, save and delete confirm with a toast; the draft handoff confirms with its receipt", async () => {
  await withPage(async page => {
    await open(page, "answer-sourced");
    await page.getByRole("button", { name: "Copy answer" }).click();
    await page.locator(".ui-toast", { hasText: "Answer copied" }).waitFor({ timeout: 3000 });
    await open(page, "contact-brief");
    await page.evaluate(() => document.addEventListener("click", event => {
      if (event.target instanceof Element && event.target.closest('a[href^="mailto:"]')) event.preventDefault();
    }, true));
    await page.getByRole("button", { name: "Prepare editable brief" }).click();
    await page.getByRole("link", { name: "Open email draft" }).click();
    // With the brief summary on (D3, 2026-11-04) the receipt replaces the toast; PR1e-G8 and PR1e-G9 cover both branches.
    await page.locator(".oak-brief__sent-line", { hasText: "Email draft opened" }).waitFor({ timeout: 3000 });
  }, { permissions: ["clipboard-read", "clipboard-write"] });

  const { onOakToast, showOakToast } = loadTsx("src/lib/oakToasts.ts");
  const added = [];
  const stop = onOakToast(toast => added.push(toast.title));
  for (const kind of ["saved", "deleted", "exported", "copied"]) showOakToast(kind);
  stop();
  assert.deepEqual(added, ["Conversation saved", "Saved conversation deleted", "Conversation downloaded", "Answer copied"]);
  // Save and delete need an account and the network, which the gallery never calls; their success branches raise the toast.
  const save = readFileSync("src/lib/oakSavedHistoryWorkspace.ts", "utf8");
  assert.match(save, /savePending: false, saveError: null \}\);\n\s*showOakToast\("saved"\);/);
  const lifecycle = readFileSync("src/lib/oakSavedLifecycleActions.ts", "utf8");
  assert.match(lifecycle, /Saved application history deleted[^\n]*showOakToast\('deleted'\)/);
  assert.match(lifecycle, /Download offered[^\n]*showOakToast\('exported'\)/);
});

const tooltipFor = async (page, name, leave = true) => {
  await page.getByRole("button", { name, exact: true }).hover();
  const tip = page.locator(".ui-tooltip-content").filter({ has: page.locator(".ui-kbd") });
  await tip.waitFor({ timeout: 3000 });
  const text = await tip.innerText();
  if (!leave) return text;
  await page.mouse.move(2, 2);
  await tip.waitFor({ state: "detached", timeout: 3000 });
  return text;
};

test("D19-G4 Send, Close and Stop tooltips show their keyboard shortcut", () => withPage(async page => {
  await open(page, "composing");
  assert.equal(await page.locator(".ui-tooltip-content").count(), 0, "initial focus on Close does not pop its hint");
  assert.match(await tooltipFor(page, "Send"), /Send message\s*Enter/);
  assert.equal(await page.getByRole("button", { name: "Send", exact: true }).getAttribute("aria-keyshortcuts"), "Enter");
  assert.match(await tooltipFor(page, "Close"), /Close\s*Esc/);
  await open(page, "thinking");
  assert.match(await tooltipFor(page, "Stop"), /Stop answer\s*Esc/);
  // The composer's Escape-to-stop handler has its own unit test in d07-composer.test.mjs.
  await open(page, "composing");
  assert.match(await tooltipFor(page, "Close", false), /Close\s*Esc/);
  await page.keyboard.press("Escape");
  await page.locator(".oak-workspace").waitFor({ state: "hidden", timeout: 3000 });
}));

test("D19-G5 saved history shows skeleton rows while it loads", () => withPage(async page => {
  await open(page, "saved-loading");
  const rows = page.locator(".oak-saved__row--skeleton");
  assert.equal(await rows.count(), 3);
  for (const row of await rows.all()) {
    assert.equal(await row.getAttribute("aria-hidden"), "true");
    assert.equal(await row.locator(".ui-skeleton").count(), 2);
  }
  assert.equal(await page.getByRole("status").filter({ hasText: "Loading saved history" }).count(), 1, "the wait is announced once");
  assert.equal(await rows.first().locator(".ui-skeleton").first().evaluate(node => getComputedStyle(node).animationName), "ui-skeleton-sweep");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await rows.first().locator(".ui-skeleton").first().evaluate(node => getComputedStyle(node).animationName), "none");
}));
