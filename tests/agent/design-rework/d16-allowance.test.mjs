import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D16-G1 the allowance card offers Contact Steve and no Retry", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=quota-reached`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const card = page.locator('.oak-turn__stopped[data-failure="allowance"]');
    await card.waitFor();
    assert.equal(await card.getByRole("button", { name: "Retry" }).count(), 0, "no retry that would meet the same limit");
    assert.equal(await card.getByRole("button", { name: "Contact Steve" }).count(), 1);
  } finally {
    await browser.close();
  }
});

test("D16-G2 the quota-reached gallery state shows the allowance card and its stopwatch, not the stopped-answer card", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=quota-reached`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    await page.locator('.oak-turn__stopped[data-failure="allowance"]').waitFor();
    const text = await page.locator(".oak-turn__stopped").innerText();
    assert.match(text, /used the answers available for now/);
    assert.doesNotMatch(text, /stopped before it finished/);
    assert.equal(await page.locator('.oak-turn__stopped [data-pose="waiting"]').count(), 1, "the stopwatch sprite marks the wait");
  } finally {
    await browser.close();
  }
});

test("D16-G2 the allowance notice is said once: the card shows it and no second status line repeats it", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=quota-reached`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    await page.locator('.oak-turn__stopped[data-failure="allowance"]').waitFor();
    assert.equal(await page.locator(".oak-workspace__status", { hasText: "used the answers available" }).count(), 0, "no visible duplicate line");
    // Q03-G4 (intentional update): the transcript's one live region announces the failure; no second sr-only line repeats it.
    assert.equal(await page.locator(".sr-only", { hasText: "used the answers available" }).count(), 0, "said once");
  } finally {
    await browser.close();
  }
});

test("D16-G1 the allowance card offers Contact Steve and never Sign in for more, since signing in adds saved chats, not answers (ADR 0002)", () => {
  const { OakTurn } = loadTsx("src/components/agent/OakTurn.tsx");
  const card = onSignIn => renderToStaticMarkup(createElement(OakTurn, { message: { id: "m2", role: "assistant", text: "", answer: null, cards: [], usage: null,
    state: "failed", failure: "allowance", page: "/" }, question: "q", progress: "", contactPreference: null, retry: null, copied: null,
    onCopy() {}, onContact() {}, onSignIn }));
  for (const onSignIn of [() => {}, undefined]) {
    assert.match(card(onSignIn), /Contact Steve/);
    assert.doesNotMatch(card(onSignIn), /Sign in for more/);
  }
});
