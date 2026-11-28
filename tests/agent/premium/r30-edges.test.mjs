// R30 edges (Q25-G21 to G23, G26, G27): what the visitor meets when a turn is cut off, shared, or ended from outside.
// Store tests drive the real workspace store with a hand-held transport. The keyboard and gallery tests drive the dev
// gallery (OAK_GALLERY_URL, see tests/agent/premium/gallery.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { createLoader, stubSets } from "../design-rework/load-tsx.mjs";
import { arcProbe, equalHeightProbe, insetProbe, slackProbe, tintProbe } from "./arc-probe.mjs";
import { galleryStates, galleryUrl, openState, stateById } from "./gallery.mjs";

const guest = { configured: false, kind: "guest", phase: "guest", role: "visitor", publishableKey: null, purpose: null,
  allowance: { answers: { limit: 6, remaining: 6, refillsAt: null }, window: { completed: 0, pending: 0, limit: 100, remaining: 100 } } };
const accountKey = "pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk";
const account = { ...guest, configured: true, kind: "account", phase: "ready", purpose: "exploring", publishableKey: accountKey,
  allowance: { answers: { limit: 6, remaining: 5, refillsAt: null }, window: { completed: 1, pending: 0, limit: 100, remaining: 99 } } };

/** One browser tab: its own copy of the store, a transport whose streams the test finishes by hand, and a movable account context. */
function tab({ signedIn = false } = {}) {
  const documentTarget = new EventTarget();
  Object.assign(documentTarget, { documentElement: { dataset: {} }, body: { dataset: { oakAgentEligible: "true", oakMascotEligible: "true", oakSourceIds: '["home-source"]' } },
    querySelectorAll: () => [], querySelector: () => null });
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.document = documentTarget;
  globalThis.window = Object.assign(new EventTarget(), { location: { pathname: "/" }, innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980,
    visualViewport: Object.assign(new EventTarget(), { height: 900, width: 1440 }) });
  const runs = [], cancels = [], listeners = new Set();
  let context = { epoch: 0, accountVersion: 0, authenticated: signedIn }, status = signedIn ? account : guest;
  const load = createLoader({ use: [stubSets.react, stubSets.workspaceStore({
    account: { getOakAccountContext: () => context, subscribeOakAccountContext: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      readOakAuthStatus: async () => status, continueOakAccount: async () => { throw new Error("not-configured"); }, resumeOakAccount: async () => false,
      signOutOakAccount: async () => {} },
    handoff: { saveOakAuthHandoff: () => true, readOakAuthHandoff: () => null, clearOakAuthHandoff: () => {}, clearOakConversationHandoff: () => {} },
    transport: {
      streamOakTurn: (turn, signal, callbacks) => new Promise((resolve, reject) => runs.push({ turn, signal, callbacks, resolve, reject })),
      cancelOakTurn: (...ids) => { cancels.push(ids); return Promise.resolve(); },
    } })],
    stubs: {
      "../../packages/oak-agent-contracts/src/output": { renderOakAnswer: () => "Fixture answer" },
      "./oakToasts": { showOakToast: () => {} },
      "./oakSignInConfiguration": { readOakSignInConfiguration: async () => ({ kind: "sign-in-config", configured: false, publishableKey: null }) },
      "./oakDocumentsWorkspace": { getOakDocumentTurnContext: () => null, getOakDocumentsController: () => ({ snapshot: () => ({ pending: false, usedSelections: [] }), disposeOwned() {}, close() {}, cancel() {}, open() {} }),
        oakDocumentFailure: () => "Fixture document failure" },
    } });
  load("src/lib/oakVoiceWorkspace.ts");
  const store = load("src/lib/oakWorkspace.ts");
  store.installOakPresentationOwner();
  store.requestOakWorkspace({});
  return { store, runs, cancels,
    /** The account context moves, as when the account is signed out in another tab. */
    signOutElsewhere() { status = guest; context = { epoch: context.epoch + 1, accountVersion: context.accountVersion + 1, authenticated: false }; for (const listener of listeners) listener(); },
    ask(text) { store.setOakDraft(text); return store.submitOakTurn(); } };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 20));
const messages = store => store.getOakWorkspace().messages;

test("Q25-G21 a stream cut by a reload or a dropped connection fails calmly and gives the question back to retry", async () => {
  const { store, runs, ask } = tab();
  const sent = ask("What has Steve built?");
  await settle();
  runs[0].callbacks.output({ answer: null, cards: [], usage: null });
  runs[0].reject(new TypeError("network error"));
  await sent;
  const state = store.getOakWorkspace();
  assert.equal(state.pending, false, "nothing is left running");
  assert.equal(state.messages.at(-1).state, "failed");
  assert.equal(state.draft, "What has Steve built?", "the question is back in the box");
  assert.ok(state.error && !/TypeError|network error|undefined/.test(state.error), `a plain notice, got: ${state.error}`);
  assert.equal(store.oakRetryKind(state, state.messages.at(-1).id), "resend", "one click retries");
});

test("Q25-G21 the page that loads after a reload is idle, clean, and sends a new turn that cannot collide with the cut one", async () => {
  const before = tab();
  before.ask("First question");
  await settle();
  const cutOff = before.runs[0].turn;
  const after = tab(); // the reload: a new store, nothing carried over
  const state = after.store.getOakWorkspace();
  assert.equal(state.pending, false);
  assert.equal(state.error, null);
  assert.deepEqual(state.messages, []);
  after.ask("First question");
  await settle();
  assert.equal(after.runs.length, 1);
  assert.notEqual(after.runs[0].turn.requestId, cutOff.requestId, "a fresh request id, so the Worker's duplicate check never refuses it");
  assert.notEqual(after.runs[0].turn.conversationId, cutOff.conversationId);
});

test("Q25-G22 a second tab mid-stream keeps its own turn: separate ids, separate transcripts, a Stop that reaches only its own turn", async () => {
  const a = tab(), b = tab();
  a.ask("Question from tab A");
  await settle();
  b.ask("Question from tab B");
  await settle();
  assert.equal(a.runs.length, 1);
  assert.equal(b.runs.length, 1);
  assert.notEqual(a.runs[0].turn.requestId, b.runs[0].turn.requestId);
  assert.notEqual(a.runs[0].turn.conversationId, b.runs[0].turn.conversationId);
  b.runs[0].callbacks.output({ answer: null, cards: [], usage: null });
  assert.equal(messages(a.store).length, 2, "tab B's stream never reaches tab A");
  assert.equal(messages(a.store).at(-1).state, "pending");
  a.store.stopOakTurn();
  assert.deepEqual(a.cancels.map(ids => ids[0]), [a.runs[0].turn.requestId]);
  assert.deepEqual(b.cancels, [], "tab A's Stop cancels nothing of tab B's");
  assert.equal(b.store.getOakWorkspace().pending, true);
  b.runs[0].reject(new DOMException("done", "AbortError"));
});

test("Q25-G22 sending twice in one tab while a turn runs sends one request, so one allowance unit", async () => {
  const { store, runs, ask } = tab();
  ask("One question");
  await settle();
  store.setOakDraft("One question again");
  await store.submitOakTurn();
  await settle();
  assert.equal(runs.length, 1);
  assert.equal(store.getOakWorkspace().draft, "One question again", "the second text waits in the box");
});

test("Q25-G22 a second tab refused for a duplicate request reads as a calm failure and leaves the first turn running", async () => {
  const a = tab(), b = tab();
  a.ask("Same question");
  b.ask("Same question");
  await settle();
  b.runs[0].reject(new Error("answer-unavailable"));
  await settle();
  assert.equal(b.store.getOakWorkspace().pending, false);
  assert.equal(b.store.getOakWorkspace().messages.at(-1).state, "failed");
  assert.equal(a.store.getOakWorkspace().pending, true);
  a.runs[0].reject(new DOMException("done", "AbortError"));
});

test("Q25-G23 signing out in another tab mid-turn ends the turn calmly and clears the account from the screen", async () => {
  const { store, runs, cancels, ask, signOutElsewhere } = tab({ signedIn: true });
  await store.refreshOakAuthStatus();
  ask("A private question");
  await settle();
  runs[0].callbacks.output({ answer: null, cards: [], usage: null });
  signOutElsewhere();
  await settle();
  const state = store.getOakWorkspace();
  assert.equal(runs[0].signal.aborted, true, "the stream is stopped");
  assert.equal(cancels.length, 1, "and the Worker is told to stop");
  assert.equal(state.pending, false);
  assert.equal(state.progress, "");
  assert.ok(!state.messages.some(message => message.state === "pending"), "no answer is left pretending to write");
  assert.ok(!JSON.stringify(state).includes(accountKey), "the account key is gone from the screen state");
  assert.notEqual(state.authStatus?.kind, "account", "the account's allowance and name no longer show");
  assert.equal(state.authReauthenticate, false, "a sign-out is not an expired session");
  assert.ok(state.error === null || /sign in/i.test(state.error));
});

// ---- Browser tests: a real page on the dev server, the chat route answered by the test ---------------------------------
const answer = JSON.parse(readFileSync("tests/agent/work-answers.v1.json", "utf8")).fixtures.find(fixture => fixture.id === "K02").expected;
const withPage = async (options, run) => {
  const browser = await chromium.launch();
  try { await run(await (await browser.newContext(options)).newPage()); } finally { await browser.close(); }
};
const focused = page => page.evaluate(() => { const node = document.activeElement; return { cls: String(node.className), name: node.getAttribute("aria-label") ?? node.textContent.trim().slice(0, 40), tag: node.tagName }; });
const key = async (page, name, times = 1) => { for (let i = 0; i < times; i++) await page.keyboard.press(name); };
/** Press Tab (or Shift+Tab) until the focused element matches `selector`; the number of presses it took. */
const tabTo = async (page, selector, key_ = "Tab", limit = 40) => {
  for (let presses = 1; presses <= limit; presses++) {
    await page.keyboard.press(key_);
    if (await page.evaluate(sel => document.activeElement.matches(sel), selector)) return presses;
  }
  assert.fail(`${key_} never reached ${selector} within ${limit} presses`);
};
/** The site, with the guest status and the chat route answered here: one sourced answer, no Worker needed. */
async function openSite(page) {
  await page.route("**/api/oak/auth/status*", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(guest) }));
  await page.route("**/api/oak/chat**", async route => {
    const turn = JSON.parse(route.request().postData()).turn;
    const knowledgeRevision = await page.evaluate(() => document.querySelector("meta[name=knowledge-revision]").content);
    const chunks = [{ type: "start", messageId: turn.requestId }, { type: "data-answer", data: { ...answer, knowledgeRevision } }, { type: "finish", finishReason: "stop" }];
    await route.fulfill({ status: 200, headers: { "X-Oak-Request-Id": turn.requestId, "x-vercel-ai-ui-message-stream": "v1", "content-type": "text/event-stream" },
      body: `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n` });
  });
  await page.goto(`${galleryUrl}/`, { waitUntil: "networkidle" });
}
const presentation = page => page.evaluate(() => document.documentElement.dataset.oakPresentation);

test("Q25-G26 a whole turn by keyboard only: open, ask, read the answer, open a source, close", async () => {
  await withPage({ viewport: { width: 1440, height: 900 } }, async page => {
    await openSite(page);
    await tabTo(page, "[data-oak-workspace-launcher]");
    await key(page, "Enter");
    await page.locator(".oak-workspace textarea").waitFor();
    assert.equal(await presentation(page), "human-agent", "Enter on the launcher opens Oak");
    assert.match((await focused(page)).name, /Message Oak/, "focus lands in the message box");
    await page.keyboard.type("What did Steve own on EcoSmartLoop?");
    await key(page, "Enter");
    await page.locator(".oak-turn__answer, .oak-workspace [data-slot=message-footer]").first().waitFor({ timeout: 15000 });
    assert.match(await page.locator(".oak-workspace").innerText(), /EcoSmartLoop article credits Frank Baah/, "the answer is on screen");
    assert.ok((await tabTo(page, ".oak-source-chip__trigger", "Shift+Tab")) <= 15, "the source chip is reachable by Shift+Tab from the message box");
    await key(page, "Enter");
    await page.locator(".oak-source-popover").waitFor();
    await page.waitForFunction(() => document.activeElement.matches(".oak-source-row"), null, { timeout: 3000 }); // focus lands as the popover finishes opening
    assert.equal(await page.locator(".oak-source-popover a.oak-source-row").first().getAttribute("href"), "https://steveoak.com/work/ecosmartloop/#where-the-direction-came-from");
    await key(page, "Escape");
    await page.locator(".oak-source-popover").waitFor({ state: "detached" });
    // Focus returns to the chip (finalFocus) as the popover finishes closing, a frame after it detaches.
    await page.waitForFunction(() => document.activeElement?.matches(".oak-source-chip__trigger"), null, { timeout: 3000 }).catch(() => {});
    assert.match((await focused(page)).cls, /oak-source-chip__trigger/, "Escape closes the sources and returns focus to the chip");
    await key(page, "Escape");
    await page.waitForFunction(() => document.documentElement.dataset.oakPresentation !== "human-agent");
    assert.equal(await presentation(page), "human-browse", "Escape closes Oak");
    // Focus returns once Oak has finished leaving.
    await page.waitForFunction(() => document.activeElement.hasAttribute("data-oak-workspace-launcher"), null, { timeout: 3000 });
  });
});

test("Q25-G26 Enter on a source opens that source", async () => {
  await withPage({ viewport: { width: 1440, height: 900 } }, async page => {
    await openSite(page);
    const opened = [];
    await page.route("https://steveoak.com/**", route => { opened.push(route.request().url()); return route.fulfill({ status: 200, contentType: "text/html", body: "<h1>source</h1>" }); });
    await tabTo(page, "[data-oak-workspace-launcher]");
    await key(page, "Enter");
    await page.locator(".oak-workspace textarea").waitFor();
    await page.keyboard.type("What did Steve own on EcoSmartLoop?");
    await key(page, "Enter");
    await page.locator(".oak-workspace [data-slot=message-footer]").first().waitFor({ timeout: 15000 });
    await tabTo(page, ".oak-source-chip__trigger", "Shift+Tab");
    await key(page, "Enter");
    await page.locator(".oak-source-popover").waitFor();
    await page.waitForFunction(() => document.activeElement.matches(".oak-source-row"), null, { timeout: 3000 });
    await key(page, "Enter");
    await page.waitForURL(/steveoak\.com\/work\/ecosmartloop/, { timeout: 10000 });
    assert.ok(opened.some(url => url.includes("/work/ecosmartloop/")), "the source page was requested");
  });
});

// ---- G27: the states that carry a condition (viewport, reducedMotion) ---------------------------------------------------
const conditional = galleryStates.filter(state => state.viewport || state.reducedMotion);
/** Open a gallery state under the condition the state declares, then let it settle. */
async function openUnderCondition(page, id) {
  const { viewport, reducedMotion } = stateById(id);
  if (viewport) await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  await openState(page, id);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
}
const surfaceMisses = async page => [...await page.evaluate(arcProbe), ...await page.evaluate(insetProbe), ...await page.evaluate(tintProbe), ...await page.evaluate(equalHeightProbe), ...await slackProbe(page)];

test("Q25-G27 one gallery state declares 390 px and one declares reduced motion", () => {
  assert.deepEqual(conditional.filter(state => state.viewport?.width === 390).map(state => state.id), ["phone-390"]);
  assert.ok(conditional.some(state => state.reducedMotion === true), "a reduced-motion state exists");
});

test("Q25-G27 the 390 px state opens at 390 px: no sideways scroll, the message box and its Send button inside the screen, surface probes clean", async () => {
  await withPage({ viewport: { width: 1440, height: 900 } }, async page => {
    await openUnderCondition(page, "phone-390");
    const fit = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      box: document.querySelector(".oak-composer").getBoundingClientRect().toJSON(), send: document.querySelector('.oak-composer button[aria-label="Send"]')?.getBoundingClientRect().toJSON() }));
    assert.equal(fit.width, 390);
    assert.ok(fit.scroll <= 390, `no sideways scroll (${fit.scroll})`);
    assert.ok(fit.box.left >= 0 && fit.box.right <= 390, "the message box fits");
    assert.ok(fit.send && fit.send.right <= 390 && fit.send.width >= 24, "Send is on screen and at least 24 px");
    assert.deepEqual(await surfaceMisses(page), []);
  });
});

test("Q25-G27 the reduced-motion state is still: nothing in Oak loops, and the surface probes are clean", async () => {
  await withPage({ viewport: { width: 1280, height: 800 } }, async page => {
    await openUnderCondition(page, "reduced-motion");
    assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
    const looping = await page.evaluate(() => document.getAnimations().filter(animation => animation.effect?.getTiming().iterations === Infinity && animation.playState === "running"
      && animation.effect.target?.closest(".oak-workspace")).map(animation => `${animation.effect.target.className} ${animation.animationName ?? animation.transitionProperty}`));
    assert.deepEqual(looping, [], "no looping animation under reduced motion");
    assert.deepEqual(await surfaceMisses(page), []);
  });
});
