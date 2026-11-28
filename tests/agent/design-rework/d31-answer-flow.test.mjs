import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
const { oakArrival, oakMotionTokens } = loadTsx("src/lib/oakMotion.ts");
const { OakTurn } = loadTsx("src/components/agent/OakTurn.tsx");
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D31-G1 a live answer arrives in order on token timing, a reopened one renders still, and reduced motion holds still", () => {
  const delays = [0, 1, 2, 3].map(order => oakArrival(order, true, false).transition.delay);
  assert.ok(delays.every((delay, index) => index === 0 || delay > delays[index - 1]), `each piece follows the one before: ${delays}`);
  assert.equal(oakArrival(0, true, false).transition.duration, oakMotionTokens.mode, "the mode token times each piece");
  assert.notDeepEqual(oakArrival(0, true, false).initial, oakArrival(0, true, false).animate);
  assert.equal(oakArrival(2, false, false).initial, false, "a turn already on screen renders at rest");
  const calm = oakArrival(3, true, true);
  // Q10 (intentional update): reduced motion keeps fades only, so a piece fades in place on the quick token without rising.
  assert.deepEqual({ ...calm.initial, opacity: 1 }, calm.animate, "reduced motion starts in place");
  assert.equal(calm.transition.duration, oakMotionTokens.quick);
  assert.equal(calm.transition.delay, undefined, "reduced motion arrives all at once");

  // OakTurn hands the pieces their places in reading order: label, answer, research, cards, then the actions.
  const source = readFileSync("src/components/agent/OakTurn.tsx", "utf8");
  const order = ["const kindIn", "const bodyIn", "const researchIn", "const cardsIn", "const footerIn"].map(marker => source.indexOf(marker));
  assert.ok(order.every((at, index) => at > 0 && (index === 0 || at > order[index - 1])), `arrival order in OakTurn: ${order}`);
  for (const [name, element] of [["kindIn", "motion.p"], ["bodyIn", "MotionBubble"], ["researchIn", "motion.div"], ["footerIn", "MotionFooter"]])
    assert.match(source, new RegExp(`<${element.replace(".", "\\.")} initial=\\{${name}\\.initial\\} animate=\\{${name}\\.animate\\} transition=\\{${name}\\.transition\\}`), `${element} arrives in its place`);

  const answer = { kind: "gap", knowledgeRevision: "r", acknowledgment: null, claims: [{ id: "c", text: "Steve owned the app.", citations: [] }] };
  const turn = enter => renderToStaticMarkup(createElement(OakTurn, { message: { id: "a1", role: "assistant", text: "Steve owned the app.", answer, cards: [], usage: null, state: "complete", page: "/" },
    question: "q", progress: "", contactPreference: "open", retry: null, copied: null, onCopy() {}, onContact() {}, enter }));
  assert.match(turn(true), /class="oak-turn__answer" data-arrive="live"/, "a live answer marks its points and sources to settle in");
  // Review v4 supersedes D31's exact label markup: the eyebrow now names its kind (data-kind) so a gap can take the gold tone.
  assert.match(turn(true), /class="oak-turn__kind" data-kind="gap" style="opacity:0;transform:translateY\(8px\)"/, "the label starts below and transparent");
  assert.match(turn(false), /class="oak-turn__kind" data-kind="gap"[\s\S]*?data-tone="gold"/, "an evidence gap's tile takes the warning gold");
  assert.doesNotMatch(turn(false), /data-arrive/, "a reopened answer has no arrival");
  assert.doesNotMatch(turn(false), /opacity:0/, "a reopened answer renders at rest");

  const css = readFileSync("src/styles/oakAgent.css", "utf8");
  assert.match(css, /\.oak-turn__answer\[data-arrive="live"\] \.ui-bubble__content > \* \{\s*animation: oak-answer-point var\(--motion-mode\)/);
  assert.match(css, /\.oak-turn__answer\[data-arrive="live"\] \.ui-bubble__content > :nth-child\(2\) \{ animation-delay/);
  // D122: answer points end in a source chip, which pops in like the trail's pills.
  assert.match(css, /\.oak-turn__answer\[data-arrive="live"\] :is\(\.oak-message__source, \.oak-source-chip\) \{\s*animation: oak-answer-pill/);
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf(".oak-turn__shimmer")));
  assert.match(reduced, /\.oak-turn__answer\[data-arrive="live"\] \.ui-bubble__content > \*,[\s\S]*?animation: none/);

  const transcript = readFileSync("src/components/agent/OakTranscript.tsx", "utf8");
  assert.match(transcript, /all\.at\(-1\)\?\.state === "pending" && index >= all\.length - 2/, "a first question and its pending answer still rise when the transcript mounts with them");
});

test("D31-G1 in the browser the first question crossfades the welcome away and the answer's points settle in after their label", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await page.goto(`${galleryUrl}/__dev/oak-states?state=empty`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    assert.equal(await page.locator(".oak-workspace__welcome").count(), 1);
    await page.evaluate(() => window.__oakGallery.sendUser("What did Steve own on the EcoSmartLoop classifier?"));
    // The welcome lifts out of flow while it fades, so the transcript takes its place at once.
    const leaving = await page.locator(".oak-workspace__welcome").evaluate(node => ({ position: getComputedStyle(node).position, opacity: Number(getComputedStyle(node).opacity) })).catch(() => null);
    if (leaving) assert.equal(leaving.position, "absolute", "the welcome pops out of layout while it fades");
    await page.locator(".oak-workspace__welcome").waitFor({ state: "detached", timeout: 3000 });
    await page.locator('.ui-message[data-state="pending"]').waitFor();
    await page.evaluate(() => window.__oakGallery.completeAssistant("Steve owned the app around the classifier."));
    const arriving = page.locator('.oak-turn__answer[data-arrive="live"]');
    await arriving.waitFor({ state: "attached", timeout: 3000 });
    const opacity = await page.locator(".oak-turn__answer .ui-bubble").evaluate(node => Number(getComputedStyle(node).opacity));
    assert.ok(opacity < 1, `the answer starts mid-arrival, not all at once (opacity ${opacity})`);
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector(".oak-turn__answer .ui-bubble")).opacity) === 1, null, { timeout: 3000 });
  } finally {
    await browser.close();
  }
});
