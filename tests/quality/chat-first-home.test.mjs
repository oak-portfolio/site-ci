import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const page = read("src/pages/index.astro");
const css = read("src/styles/home-chat.css");
const islands = read("src/components/home/OakChatFirstHome.tsx") + read("src/components/home/OakHomeComposer.tsx");
const flag = read("src/lib/oakFlags/chatFirstHome.ts");

test("index.astro renders each home section once, with the chat chrome around them", () => {
  for (const view of ["<HomeHero", "<HomeProof", "<WorkPreviewSection", "<HomeWorkspace"]) {
    assert.equal(page.split(view).length - 1, 1, `${view} appears once`);
  }
  assert.match(page, /<OakChatFirstHome\b/);
  assert.match(page, /<OakHomeComposer\b/);
  assert.doesNotMatch(islands, /heroCopy|proofSections|featureCards|workspaceRows/, "the islands copy no section content");
});

test("with the constant off nothing new reaches the page: chrome, stylesheet and script all sit behind the switch", () => {
  assert.match(page, /const chatForced = oakChatFirstHomeOn\(\);\nconst chatFirst = chatForced \|\| import\.meta\.env\.DEV;/);
  assert.match(page, /if \(chatForced \|\| new URLSearchParams\(location\.search\)\.get\("oakChatFirstHome"\) === "1"\)/, "under astro dev only the query flag switches it on");
  assert.doesNotMatch(page, /import\s+["']@\/styles\/home-chat\.css["']/, "no side-effect import that would ship the stylesheet");
  assert.match(page, /home-chat\.css\?url/);
  for (const piece of ["<OakChatFirstHome", "<OakHomeComposer", "<link rel=\"stylesheet\"", "<script is:inline"]) {
    const at = page.indexOf(piece);
    assert.ok(at > 0, `${piece} is in the page`);
    assert.match(page.slice(Math.max(0, page.lastIndexOf("{", at) - 2), at), /\{chatFirst && /, `${piece} sits behind chatFirst`);
  }
});

test("the inline pre-paint script reads the same key the island writes", () => {
  const key = flag.match(/oakHomeModeKey = "([^"]+)"/)?.[1];
  assert.ok(key);
  assert.ok(page.includes(`"${key}"`));
});

test("no section is hidden or duplicated by the chat layout", () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  for (const [, selector, body] of rules) {
    const hides = /display:\s*none|visibility:\s*hidden|clip(-path)?:/.test(body);
    if (!hides) continue;
    assert.doesNotMatch(selector, /data-oak-section|hero-stage|section-block|platform-block|#main-content|main\b/, `${selector.trim()} must not hide a section`);
  }
});

const builtOn = process.env.OAK_CHAT_FIRST_HOME_DIST;
test("a build with the constant on has one copy of each section heading", { skip: !builtOn && "set OAK_CHAT_FIRST_HOME_DIST to a dist built with the constant on" }, () => {
  const html = readFileSync(path.join(builtOn, "index.html"), "utf8");
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1);
  for (const id of ["hero-title", "standard-heading", "platform-heading", "workspace-heading"]) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1, `${id} once`);
  }
  for (const tag of ["home.hero", "home.proof", "home.workspace"]) {
    assert.equal(html.split(`data-oak-section="${tag}"`).length - 1, 1, `${tag} once`);
  }
  assert.match(html, /data-oak-chat-home/);
});

const offPair = [process.env.OAK_HOME_BASE_HTML, process.env.OAK_HOME_OFF_HTML];
test("with the constant off built / equals the base build", { skip: !offPair.every((file) => file && existsSync(file)) && "set OAK_HOME_BASE_HTML and OAK_HOME_OFF_HTML" }, () => {
  const strip = (file) => readFileSync(file, "utf8").replace(/\/_astro\/[^"' )]+/g, "/_astro/*").replace(/\s+/g, " ");
  assert.equal(strip(offPair[1]), strip(offPair[0]));
});

test("the Browse list reads only the bundled site inventory, so it needs no Worker", () => {
  const palette = read("src/components/OakCommandPalette.tsx");
  assert.doesNotMatch(palette, /\bfetch\(|\/api\/oak/);
  assert.match(palette, /@\/data\/oakSiteInventory/);
});

const devUrl = process.env.OAK_CHAT_HOME_URL;
const sizes = [{ width: 1280, height: 800 }, { width: 390, height: 844 }];
async function chatHome(viewport, { route, permissions } = {}) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport, reducedMotion: "reduce", permissions });
  const calls = [];
  page.on("request", (request) => { if (request.url().includes("/api/oak/")) calls.push(request.url()); });
  if (route) await page.route("**/api/oak/**", route);
  await page.goto(new URL("/?oakChatFirstHome=1", devUrl).href, { waitUntil: "networkidle" });
  await page.waitForSelector(".home-chat__composer textarea");
  return { browser, page, calls };
}

test("on the first screen the hero's Say Hi sits above the docked composer", { skip: !devUrl && "set OAK_CHAT_HOME_URL to a dev server" }, async () => {
  for (const viewport of sizes) {
    const { browser, page } = await chatHome(viewport);
    try {
      const [cta, composer] = await page.evaluate(() => [".hero-copy .contact-trigger", ".home-chat__composer"].map((selector) => {
        const { top, bottom, left, right } = document.querySelector(selector).getBoundingClientRect();
        return { top, bottom, left, right };
      }));
      const overlaps = cta.left < composer.right && composer.left < cta.right && cta.top < composer.bottom && composer.top < cta.bottom;
      assert.equal(overlaps, false, `${viewport.width}: Say Hi ${JSON.stringify(cta)} meets the composer ${JSON.stringify(composer)}`);
      assert.ok(cta.bottom <= composer.top && cta.bottom <= viewport.height, `${viewport.width}: Say Hi is on the first screen above the composer`);
    } finally { await browser.close(); }
  }
});

test("Browse opens the site list with the Worker unreachable", { skip: !devUrl && "set OAK_CHAT_HOME_URL to a dev server" }, async () => {
  const { browser, page, calls } = await chatHome(sizes[0], { route: (route) => route.abort("connectionrefused") });
  try {
    await page.getByRole("radio", { name: "Search" }).or(page.getByRole("button", { name: "Search" }).first()).first().click();
    await page.locator(".home-chat__composer button[type=submit]").click();
    const input = page.getByRole("dialog").getByRole("combobox").or(page.getByRole("dialog").locator("input")).first();
    await input.fill("work");
    await page.getByRole("dialog").getByRole("option").first().waitFor();
    assert.ok(await page.getByRole("dialog").getByRole("option").count() > 0);
    assert.deepEqual(calls.filter((url) => !url.includes("/api/oak/auth/status")), [], "Browse sent nothing to the Worker");
  } finally { await browser.close(); }
});

test("signed in and signed out see the same first screen (owner fixture)", { skip: !devUrl && "set OAK_CHAT_HOME_URL to a dev server" }, async () => {
  const owner = { configured: true, kind: "account", phase: "ready", role: "owner", publishableKey: null, purpose: "other",
    allowance: { answers: { limit: 12, remaining: 12, refillsAt: null }, window: { completed: 0, pending: 0, limit: 60, remaining: 60 } } };
  for (const viewport of sizes) {
    const out = await chatHome(viewport);
    const signedIn = await chatHome(viewport, { route: (route) => route.request().url().includes("/auth/status")
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(owner) }) : route.continue() });
    try {
      for (const run of [out, signedIn]) await run.page.addStyleTag({ content: "*{caret-color:transparent!important}" });
      const [a, b] = await Promise.all([out.page.screenshot(), signedIn.page.screenshot()]);
      assert.ok(a.equals(b), `${viewport.width}: signed-in first screen equals signed-out`);
      assert.deepEqual([out.calls, signedIn.calls], [[], []], "no status read on load either way");
    } finally { await out.browser.close(); await signedIn.browser.close(); }
  }
});

const claimText = "Steve built the Oak AI Agent end to end.";
const ownerStatus = { configured: true, kind: "account", phase: "ready", role: "owner", publishableKey: null, purpose: "other",
  allowance: { answers: { limit: 12, remaining: 11, refillsAt: null }, window: { completed: 0, pending: 0, limit: 60, remaining: 60 } } };
const answeringWorker = (status) => (route) => {
  const request = route.request();
  if (!request.url().includes("/api/oak/chat")) return status
    ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(status) })
    : route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "identity-unavailable" }) });
  const { turn } = JSON.parse(request.postData() ?? "{}");
  const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "fixture", hardPolicyVersion: "fixture", knowledgeRevision: "fixture",
    operations: ["read"], kind: "sourced", acknowledgment: null, claims: [{ id: "claim-one", text: claimText,
      citations: [{ documentId: "work:ecosmartloop", passageId: "p", sectionId: "s", url: "https://steveoak.com/work/ecosmartloop/#proof" }] }] };
  const parts = [{ type: "start", messageId: turn.requestId }, { type: "data-answer", data: answer },
    { type: "data-usage", data: { requestId: turn.requestId, state: "settled", actualMicroUsd: 450, heldMicroUsd: 0 } }, { type: "finish", finishReason: "stop" }];
  return route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "X-Oak-Request-Id": turn.requestId, "x-vercel-ai-ui-message-stream": "v1" },
    body: parts.map((part) => `data: ${JSON.stringify(part)}\n\n`).join("") });
};
const inlineState = (page) => page.evaluate(() => {
  const thread = document.querySelector(".home-chat__thread");
  const sections = [...document.querySelectorAll("#main-content > section")];
  return { presentation: document.documentElement.dataset.oakPresentation, inert: [...document.querySelectorAll(".route-surface, .site-header")].some((element) => element.inert),
    dialog: Boolean(document.querySelector(".oak-workspace[role=dialog]")), text: thread?.innerText ?? "",
    belowOpening: Boolean(thread && sections.length && sections.at(-1).compareDocumentPosition(thread) & Node.DOCUMENT_POSITION_FOLLOWING) };
});

test("an ask from the home composer answers inline under the Opening turn, with no dialog and no inert page, and a reload keeps the thread", { skip: !devUrl && "set OAK_CHAT_HOME_URL to a dev server" }, async () => {
  const shots = process.env.OAK_CHAT_HOME_SHOTS;
  for (const viewport of sizes) for (const status of shots ? [null, ownerStatus] : [null]) {
    const { browser, page } = await chatHome(viewport, { route: answeringWorker(status) });
    try {
      await page.locator(".home-chat__composer textarea").fill("What has Steve built?");
      await page.locator(".home-chat__composer textarea").press("Enter");
      await page.locator(".home-chat__thread").getByText(claimText).first().waitFor({ timeout: 15000 });
      let state = await inlineState(page);
      assert.deepEqual([state.presentation, state.inert, state.dialog, state.belowOpening], ["human-browse", false, false, true], `${viewport.width}: inline, no dialog, page live`);
      assert.match(state.text, /What has Steve built\?/);
      assert.equal(await page.locator(".home-chat__composer textarea").inputValue(), "", "the sent words leave the box");
      if (shots) {
        await page.locator(".home-chat__thread").scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${shots}/answered-${viewport.width}${status ? "-in" : ""}-rm.png` });
      }
      await page.reload({ waitUntil: "networkidle" });
      await page.locator(".home-chat__thread").getByText(claimText).first().waitFor({ timeout: 15000 });
      state = await inlineState(page);
      assert.deepEqual([state.presentation, state.inert, state.dialog], ["human-browse", false, false], `${viewport.width}: the reload keeps the thread inline`);
    } finally { await browser.close(); }
  }
});

test("at the answer limit the refill sheet has its heading and clears the hero heading on the first screen", { skip: !devUrl && "set OAK_CHAT_HOME_URL to a dev server" }, async () => {
  const limitStatus = { ...ownerStatus, allowance: { ...ownerStatus.allowance, answers: { limit: 12, remaining: 0, refillsAt: Date.now() + 3 * 3600_000 } } };
  for (const viewport of sizes) {
    const { browser, page } = await chatHome(viewport);
    try {
      await page.evaluate(async (authStatus) => {
        const store = await import("/src/lib/oakWorkspace.ts");
        store.setOakWorkspaceFixture({ authStatus, messages: [] });
      }, limitStatus);
      const heading = page.getByRole("heading", { name: "You are out of free answers." });
      await heading.waitFor({ timeout: 5000 });
      assert.match(await page.locator(".home-chat__refill-more").innerText(), /^More in /);
      const [h1, sheet] = await page.evaluate(() => [".hero-copy h1", ".home-chat__composer"].map((selector) => {
        const { top, bottom } = document.querySelector(selector).getBoundingClientRect();
        return { top, bottom };
      }));
      assert.ok(sheet.top >= h1.bottom, `${viewport.width}: sheet top ${sheet.top} clears the hero h1 bottom ${h1.bottom}`);
    } finally { await browser.close(); }
  }
});

test("after an inline answer the thread reserves only the composer's height below its actions", { skip: !devUrl && "set OAK_CHAT_HOME_URL to a dev server" }, async () => {
  for (const viewport of sizes) {
    const { browser, page } = await chatHome(viewport, { route: answeringWorker(null) });
    try {
      await page.locator(".home-chat__composer textarea").fill("What has Steve built?");
      await page.locator(".home-chat__composer textarea").press("Enter");
      await page.locator(".home-chat__thread").getByText(claimText).first().waitFor({ timeout: 15000 });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const gap = await page.evaluate(() => {
        const answer = [...document.querySelectorAll(".home-chat__thread .ui-message")].at(-1).getBoundingClientRect();
        return document.querySelector(".home-chat__composer").getBoundingClientRect().top - answer.bottom;
      });
      assert.ok(gap >= 0 && gap <= 80, `${viewport.width}: gap between the answer actions and the composer is ${gap}px`);
    } finally { await browser.close(); }
  }
});

test("copying an inline answer shows its confirmation toast above the docked composer", { skip: !devUrl && "set OAK_CHAT_HOME_URL to a dev server" }, async () => {
  for (const viewport of sizes) {
    const { browser, page } = await chatHome(viewport, { route: answeringWorker(null), permissions: ["clipboard-read", "clipboard-write"] });
    try {
      await page.locator(".home-chat__composer textarea").fill("What has Steve built?");
      await page.locator(".home-chat__composer textarea").press("Enter");
      await page.locator(".home-chat__thread").getByText(claimText).first().waitFor({ timeout: 15000 });
      await page.locator(".home-chat__thread").getByRole("button", { name: "Copy answer" }).last().click();
      const toast = page.locator(".home-chat__toasts .ui-toast").filter({ hasText: "Answer copied" });
      await toast.waitFor({ timeout: 5000 });
      const [box, composer] = await Promise.all([toast.boundingBox(), page.locator(".home-chat__composer").boundingBox()]);
      assert.ok(box.y >= 0 && box.y + box.height <= composer.y, `${viewport.width}: toast in view, above the composer`);
      assert.equal(await page.locator(".oak-workspace[role=dialog]").count(), 0, "no dialog");
    } finally { await browser.close(); }
  }
});

test("with the flag off the home hosts nothing inline and the launcher opens the dialog over an inert page", { skip: !devUrl && "set OAK_CHAT_HOME_URL to a dev server" }, async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: sizes[0] });
    await page.route("**/api/oak/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
    await page.goto(new URL("/", devUrl).href, { waitUntil: "networkidle" });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.oakHome ?? null), null);
    assert.equal(await page.locator(".home-chat__thread").count(), 0);
    await page.locator("#oak-agent-launcher").click();
    await page.locator(".oak-workspace").waitFor();
    const state = await inlineState(page);
    assert.deepEqual([state.presentation, state.inert], ["human-agent", true]);
  } finally { await browser.close(); }
});

test("each composer mode takes a 44px tap target at 1280 and 390", { skip: !devUrl && "set OAK_CHAT_HOME_URL to a dev server" }, async () => {
  for (const viewport of sizes) {
    const { browser, page } = await chatHome(viewport);
    try {
      const targets = await page.evaluate(() => [...document.querySelectorAll(".home-chat__mode")].map((mode) => {
        const box = mode.getBoundingClientRect(), hit = getComputedStyle(mode, "::before");
        return { width: box.width, height: Math.max(box.height, parseFloat(hit.height)) };
      }));
      assert.equal(targets.length, 3);
      for (const target of targets) assert.ok(target.width >= 44 && target.height >= 44, `${viewport.width}: ${JSON.stringify(target)}`);
    } finally { await browser.close(); }
  }
});
