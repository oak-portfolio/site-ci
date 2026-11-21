import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { createLoader, stubSets } from "./load-tsx.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const load = createLoader({ use: [stubSets.icons], interop: true });
const { oakPausedBanner, oakPausedBannerOn, forceOakPausedBanner } = load("src/lib/oakFlags/pausedBanner.ts");
const { OakPausedBanner, oakPausedBannerView, oakPausedBannerTitle, oakPausedBannerAsk } = load("src/components/agent/OakPausedBanner.tsx");

const visitorFunding = Object.freeze({ selected: "visitor", phase: "connected", status: null, notice: null });
const visitorStore = { subscribeOakFunding: () => () => {}, getOakFundingState: () => visitorFunding, getOakFundingServerState: () => visitorFunding };
const visitorLoad = createLoader({ use: [stubSets.icons], stubs: { "@/lib/oakFundingSession": visitorStore }, interop: true });
const visitorFlag = visitorLoad("src/lib/oakFlags/pausedBanner.ts");
const visitorBanner = visitorLoad("src/components/agent/OakPausedBanner.tsx");

const refillsAt = Date.now() + 2 * 60 * 60 * 1000;
const clock = (at) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const status = (answers, window = { remaining: 90 }, granted) => ({
  allowance: { answers: { limit: 6, remaining: answers.remaining, refillsAt: answers.refillsAt ?? null },
    window: { completed: 0, pending: 0, limit: 100, remaining: window.remaining }, ...(granted ? { granted } : {}) },
});
const spent = status({ remaining: 0, refillsAt });
const render = (value) => renderToStaticMarkup(createElement(OakPausedBanner, { status: value }));

test.afterEach(() => { forceOakPausedBanner(null); visitorFlag.forceOakPausedBanner(null); });

test("the banner is off by default: the constant is false and a spent allowance renders nothing", () => {
  assert.equal(oakPausedBanner, false);
  assert.equal(oakPausedBannerOn(), false);
  assert.equal(render(spent), "");
});

test("while the refilling allowance is spent the banner names when an answer comes back", () => {
  forceOakPausedBanner(true);
  const html = render(spent);
  assert.match(html, /role="status"/);
  assert.ok(html.includes(oakPausedBannerTitle));
  assert.ok(html.includes(`Next answer back at ${clock(refillsAt)}.`), "names the return time");
  assert.ok(html.includes(oakPausedBannerAsk));
});

test("under the rolling 30-day cap the banner says answers return 30 days after use", () => {
  forceOakPausedBanner(true);
  const view = oakPausedBannerView(status({ remaining: 4, refillsAt }, { remaining: 0 }));
  assert.equal(view.title, oakPausedBannerTitle);
  assert.match(view.detail, /30 days after you used it/);
});

test("the banner hides when an answer returns, when grant answers remain, and while status is unknown", () => {
  forceOakPausedBanner(true);
  assert.equal(render(status({ remaining: 1 })), "");
  assert.equal(render(status({ remaining: 0, refillsAt }, { remaining: 90 }, 5)), "");
  assert.equal(render(null), "");
  assert.equal(render({}), "");
  assert.equal(oakPausedBannerView(null), null);
});

test("the banner stays hidden for a visitor on their own OpenRouter account, whom the allowance does not limit", () => {
  visitorFlag.forceOakPausedBanner(true);
  assert.equal(renderToStaticMarkup(createElement(visitorBanner.OakPausedBanner, { status: spent })), "");
});

test("the banner hides once the return time it names has passed", () => {
  forceOakPausedBanner(true);
  assert.ok(oakPausedBannerView(spent, refillsAt - 1), "still paused a moment before the named time");
  assert.equal(oakPausedBannerView(spent, refillsAt), null, "an answer is back at the named time");
  assert.equal(render(status({ remaining: 0, refillsAt: Date.now() - 1000 })), "", "a past return time shows nothing");
  const capped = status({ remaining: 0, refillsAt: Date.now() - 1000 }, { remaining: 0 });
  assert.match(oakPausedBannerView(capped).detail, /30 days after you used it/, "the 4-hour refill does not end a 30-day pause");
});

test("the banner is announced once: one status region, no nested live region, no repeated text on re-render", () => {
  forceOakPausedBanner(true);
  const first = render(spent), again = render(spent);
  assert.equal(first, again, "a re-render says the same words");
  assert.equal((first.match(/role="status"/g) ?? []).length, 1);
  assert.doesNotMatch(first, /aria-live|role="alert"/);
  assert.equal((first.match(new RegExp(oakPausedBannerTitle.replace(/\./g, "\\."), "g")) ?? []).length, 1, "the title is written once");
});

test("the banner reuses the stopped turn card's words and look", () => {
  const turn = read("src/components/agent/OakTurn.tsx");
  assert.ok(turn.includes(`title: "${oakPausedBannerTitle}"`), "same title as the allowance card in OakTurn");
  assert.ok(turn.includes(oakPausedBannerAsk), "same closing line as the allowance card in OakTurn");
  forceOakPausedBanner(true);
  const html = render(spent);
  assert.match(html, /class="oak-turn__stopped[^"]*"/);
  assert.match(html, /data-tone="limit"/);
});

test("the empty state shows the banner above the starters and keeps it behind the constant", () => {
  const empty = read("src/components/agent/OakEmptyState.tsx");
  assert.match(empty, /import \{ OakPausedBanner \} from "\.\/OakPausedBanner";/);
  const banner = empty.indexOf("<OakPausedBanner status={authStatus} />");
  assert.ok(banner > 0, "the empty state renders the banner from the workspace status");
  assert.ok(banner < empty.indexOf('className="oak-conversation__starters"'), "before the starters, so before typing");
  assert.doesNotMatch(read("src/components/agent/OakPausedBanner.tsx"), /aria-live|role="alert"/, "no second live region");
});
