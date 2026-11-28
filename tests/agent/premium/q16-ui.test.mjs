import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { galleryUrl, openState } from "./gallery.mjs";

// Q16 fix brief B (UI): D2, D3, D4, D7, D8, D10, D11 from evidence/q16-browser-qa.md.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const workspace = loadTsx("src/lib/oakWorkspace.ts");
const { requirementClause } = loadTsx("src/lib/oakQuote.ts");
const { oakShortRequirement } = loadTsx("src/components/agent/OakRoleFitReview.tsx");
const { formatOakContactBrief, emptyOakContactBrief } = loadTsx("src/lib/oakContactBrief.ts");
const saved = loadTsx("packages/oak-agent-contracts/src/saved-conversations.ts");

const open = async (page, state) => {
  await openState(page, state);
  await page.waitForTimeout(300);
};
const store = (page, fn, arg) => page.evaluate(async ([source, value]) => {
  const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => /\/src\/lib\/oakWorkspace\.ts(\?|$)/.test(name));
  const module = await import(url);
  return new Function("workspace", "value", `return (${source})(workspace, value);`)(module, value);
}, [fn.toString(), arg]);
const withBrowser = async (viewport, run) => {
  const browser = await chromium.launch();
  try { await run(await browser.newPage({ viewport })); } finally { await browser.close(); }
};

// The sample role the Compare panel offers (OakConversation.tsx), kept with its line breaks.
const sampleRole = `Senior Design Engineer, AI products

We are a small product team building AI features into a design and planning tool. You will sit between design and engineering.

What you will do
- Prototype and ship agent and chat experiences in React and TypeScript, from first sketch to production
- Own our design system in code: tokens, components, motion and accessibility
- Work with product and ML engineers on evaluation loops, so we can see when an AI feature gets better or worse
- Turn research and user feedback into clear interface decisions

What we look for
- 5+ years building product interfaces, with work you can show
- Strong frontend craft: React, CSS, animation and performance
- Experience shipping LLM features (tool calls, retrieval, streaming UI)
- Comfortable owning a problem end to end on a small team`;
const span = (from, to) => { const start = sampleRole.indexOf(from), end = sampleRole.indexOf(to) + to.length; return [sampleRole.slice(start, end), start, end]; };
const paused = () => new Response(JSON.stringify({ error: "attempt-rate-limited" }), { status: 429, headers: { "Content-Type": "application/json" } });
const fixture = extra => workspace.setOakWorkspaceFixture({ presentation: "human-agent", viewportSupported: true, viewportNotice: false, messages: [], pending: false,
  draft: "", draftKind: "question", roleDraft: null, questionDraft: null, quotes: [], error: null, ...extra });

test("Q16-D2 a paused workspace keeps one notice: a repeated refused send adds no new turn and keeps the draft", async () => {
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async () => paused();
  try {
    fixture({ draft: "What did Steve build?" });
    await workspace.submitOakTurn();
    assert.equal(workspace.getOakWorkspace().messages.length, 2, "the first refusal shows the question and one paused card");
    assert.equal(workspace.getOakWorkspace().messages.at(-1).failure, "paused");
    for (const question of ["What did Steve build?", "Another question"]) {
      workspace.setOakWorkspaceFixture({ draft: question });
      await workspace.submitOakTurn();
      assert.equal(workspace.getOakWorkspace().messages.length, 2, `"${question}" adds no second pair`);
      assert.equal(workspace.getOakWorkspace().draft, question, "the refused words stay in the message box");
    }
  } finally { globalThis.fetch = savedFetch; }
});

test("Q16-D2 a refused Compare keeps the role in its own panel, never in the message box", async () => {
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async () => paused();
  try {
    fixture({ roleDraft: { roleDescription: sampleRole, intent: "Compare this role with Steve's supported experience." } });
    await workspace.submitOakTurn();
    assert.equal(workspace.getOakWorkspace().roleDraft?.roleDescription, sampleRole, "the panel keeps the role after the refusal");
    workspace.leaveOakRoleDraft();
    assert.equal(workspace.getOakWorkspace().draft, "", "leaving never dumps the 816-character post into the message box");
    assert.equal(workspace.getOakWorkspace().roleDraft, null);
    workspace.beginOakRoleDraft();
    assert.equal(workspace.getOakWorkspace().roleDraft?.roleDescription, sampleRole, "Compare reopens with the same role");
    await workspace.submitOakTurn();
    assert.equal(workspace.getOakWorkspace().messages.length, 2, "a second refused Compare adds no new pair");
  } finally { globalThis.fetch = savedFetch; }
});

test("Q16-D2 out of answers, the typed words never vanish: the first refusal keeps them in the thread, a repeat in the message box", async () => {
  const savedFetch = globalThis.fetch;
  // R4b review: the allowance and budget limits are refusals too; a repeat removed the question and cleared the box.
  for (const error of ["allowance-exhausted", "budget-exhausted", "budget-paused", "network-allowance"]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ error }), { status: 429, headers: { "Content-Type": "application/json" } });
    try {
      fixture({ draft: "First question" });
      await workspace.submitOakTurn();
      assert.equal(workspace.getOakWorkspace().messages.at(-2)?.text, "First question", `${error}: the first refused question stays in the thread (Q03-G5)`);
      workspace.setOakWorkspaceFixture({ draft: "A second question" });
      await workspace.submitOakTurn();
      assert.equal(workspace.getOakWorkspace().messages.length, 2, `${error}: one notice`);
      assert.equal(workspace.getOakWorkspace().messages.at(-2)?.text, "First question");
      assert.equal(workspace.getOakWorkspace().draft, "A second question", `${error}: the repeat keeps what was typed`);
      await workspace.submitOakTurn();
      assert.equal(workspace.getOakWorkspace().draft, "A second question", `${error}: and again on a third try`);
    } finally { globalThis.fetch = savedFetch; }
  }
});

// Review v12 (intentional update): since R14 the message box floats over the transcript in glass, so the pill floats just
// above it over scrolled text (ChatGPT's pattern), and Oak asked for it to be "backdrop blur or solid or more opacity".
// The guarantee is now that it never covers the message box and that text under it cannot show through.
test("Q16-D3 the Latest messages pill floats above the message box on an opaque glass fill", async () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await withBrowser(viewport, async page => {
      await open(page, "long-conversation");
      await page.waitForTimeout(800);
      const reading = page.locator(".oak-conversation__viewport");
      await reading.evaluate(node => { node.scrollTop = node.scrollHeight - node.clientHeight - 260; });
      await page.waitForTimeout(700);
      const geometry = await page.evaluate(() => {
        const pill = document.querySelector(".oak-conversation__latest");
        const style = getComputedStyle(pill);
        const alpha = Number((style.backgroundColor.match(/rgba?\(([^)]+)\)/)?.[1].split(",")[3] ?? "1").trim());
        return { active: pill?.getAttribute("data-active"), bottom: pill.getBoundingClientRect().bottom,
          composer: document.querySelector(".oak-composer").getBoundingClientRect().top, alpha, blur: /blur\(/.test(style.backdropFilter || style.webkitBackdropFilter || "") };
      });
      assert.notEqual(geometry.active, "false", `${viewport.width}: the pill shows when scrolled up`);
      assert.ok(geometry.bottom <= geometry.composer + 1,
        `${viewport.width}: the pill (bottom ${Math.round(geometry.bottom)}) stays above the message box (top ${Math.round(geometry.composer)})`);
      assert.ok(geometry.alpha >= 0.85 && geometry.blur, `${viewport.width}: an opaque glass fill (alpha ${geometry.alpha}, blur ${geometry.blur})`);
    });
  }
});

test("Q16-D4 (v3 review) at 390 the Related rows read as full-width rows of text", async () => {
  // The pill rows this guarded are gone: follow-ups are Related rows under the answer, so no container query shapes them.
  await withBrowser({ width: 390, height: 844 }, async page => {
    await open(page, "role-fit-answer");
    const layout = await page.evaluate(() => {
      const list = document.querySelector(".oak-related .ui-suggestions").getBoundingClientRect();
      const title = document.querySelector(".oak-related__title").getBoundingClientRect();
      return { list: list.width, title: title.bottom, rows: [...document.querySelectorAll(".oak-related .ui-suggestion")].map(row => {
        const box = row.getBoundingClientRect();
        return { width: box.width, height: box.height, top: box.top };
      }) };
    });
    assert.ok(layout.rows.length >= 2, "rows render");
    for (const row of layout.rows) {
      assert.ok(Math.abs(row.width - layout.list) <= 1, `a full-width row (${Math.round(row.width)} of ${Math.round(layout.list)})`);
      assert.ok(row.width / row.height >= 3, `a row of text, not a circle: ${Math.round(row.width)}x${Math.round(row.height)}`);
      assert.ok(row.top >= layout.title - 1, "rows sit below the Related title");
    }
  });
});

test("Q16-D7 role-fit headings are whole clauses of the role, never fragments across bullets", () => {
  const cases = [
    [span("system in code", "- Work with"), "Own our design system in code: tokens, components, motion and accessibility"],
    [span("engineering.", "agent and chat experiences"), "Prototype and ship agent and chat experiences in React and TypeScript, from first sketch to production"],
    [span("research and user feedback", "What we"), "Turn research and user feedback into clear interface decisions"],
  ];
  for (const [[text, start, end], expected] of cases) assert.equal(requirementClause(text, start, end, sampleRole), expected);
  assert.equal(oakShortRequirement(cases[1][1]), "Prototype and ship agent and chat experiences in React and TypeScript\u2026",
    "a long clause shortens at its comma, not mid-phrase");
  // A reopened turn has no role description: the span is split at its own bullet joins and line breaks.
  assert.equal(requirementClause("ions What we look for\n- 5+ years building product interfaces, with work you can show", 0, 0),
    "5+ years building product interfaces, with work you can show");
  assert.equal(requirementClause("engineering. What you will do - Prototype and ship agent and chat experiences", 0, 0),
    "Prototype and ship agent and chat experiences");
  // R22 live: the model's span started on a label's colon, so the header read ": React, CSS, animation and performance".
  const label = "Strong frontend craft: React, CSS, animation and performance";
  const role = `What we look for\n- ${label}\n- Five years building product interfaces`;
  const colon = role.indexOf(": React"), stop = role.indexOf("performance") + "performance".length;
  assert.equal(requirementClause(role.slice(colon, stop), colon, stop, role), label);
  assert.equal(requirementClause(": React, CSS, animation and performance", 0, 0), "React, CSS, animation and performance",
    "a reopened turn without the role still drops the colon the span started on");
});

test("Q16-D7 the clause splitter never breaks inside an abbreviation or parentheses", () => {
  // R4b review: "e.g." split the clause and left "OpenAI, Anthropic) in production" as the heading.
  const role = "What we look for\n- Experience with LLM tools (e.g. OpenAI, Anthropic) in production\n- Strong craft, i.e. CSS, motion, etc. and tests vs. demos";
  const at = (from, to) => [role.slice(role.indexOf(from), role.indexOf(to) + to.length), role.indexOf(from), role.indexOf(to) + to.length];
  const [text, start, end] = at("LLM tools", "in production");
  assert.equal(requirementClause(text, start, end, role), "Experience with LLM tools (e.g. OpenAI, Anthropic) in production");
  const [craft, from, to] = at("Strong craft", "demos");
  assert.equal(requirementClause(craft, from, to, role), "Strong craft, i.e. CSS, motion, etc. and tests vs. demos");
  assert.equal(requirementClause("Experience with LLM tools (e.g. OpenAI, Anthropic) in production", 0, 0),
    "Experience with LLM tools (e.g. OpenAI, Anthropic) in production", "without the role text too");
  assert.equal(requirementClause("Use tools (see the docs. Then ship) well. Next sentence here", 0, 0), "Use tools (see the docs. Then ship) well.",
    "a full stop inside parentheses is not a sentence end");
});

test("Q16-D7 the screen-reader announcement reads the same whole clauses", () => {
  const { collectOakOutputAnnouncements } = loadTsx("src/components/agent/OakTranscript.tsx");
  const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "f", hardPolicyVersion: "f", knowledgeRevision: "f", operations: ["search"],
    kind: "role-fit", contactTopics: [], coverage: null, rows: [{ id: "r", status: "missing-evidence", evidence: [], gap: null, questions: [],
      requirement: { text: "sions What we look for\n- 5+ years building product interfaces, with work you can show", start: 0, end: 10 } }] };
  const said = collectOakOutputAnnouncements([{ id: "a", role: "assistant", text: "", answer, cards: [], usage: null, state: "complete" }], new Set());
  assert.match(said, /requirement: 5\+ years building product interfaces, with work you can show/);
  assert.doesNotMatch(said, /sions What we look for/);
});

test("Q16-D8 the brief opens with the visitor's own words: the role's title line, never the whole post or Oak's default request", () => {
  const msg = (id, role, text, answer = null, extra = {}) => ({ id, role, text, answer, cards: [], usage: null, state: "complete", ...extra });
  const ask = msg("r1:user", "user", "Compare this role with Steve's supported experience.", null, { taskKind: "role-fit" });
  const fit = msg("r1", "assistant", "", { kind: "role-fit", rows: [], contactTopics: [] }, { taskKind: "role-fit" });
  assert.equal(workspace.oakBriefSeed([ask, fit], new Map([["r1", sampleRole]])), "The role I compared: Senior Design Engineer, AI products");
  assert.equal(workspace.oakBriefSeed([ask, msg("r1", "assistant", "", null, { state: "failed", failure: "paused", taskKind: "role-fit" })], new Map()), "",
    "the Compare default request is not the visitor's words");
  const own = msg("r2:user", "user", "Which requirements matter most for a staff role?", null, { taskKind: "role-fit" });
  assert.equal(workspace.oakBriefSeed([own], new Map()), "Which requirements matter most for a staff role?");
  const text = formatOakContactBrief({ ...emptyOakContactBrief(), goals: "x", references: [
    { documentId: "work:a", passageId: "p", sectionId: "s", url: "https://steveoak.com/work/a/#hero-title" },
    { documentId: "work:a", passageId: "q", sectionId: "t", url: "https://steveoak.com/work/a/#work-in-progress-panel-title" }] });
  assert.match(text, /Public work references I selected:\nhttps:\/\/steveoak\.com\/work\/a\/$/);
  assert.doesNotMatch(text, /#/);
});

test("Q16-D10 saved conversations are named by their first question, with the date as metadata", async () => {
  assert.equal(saved.savedConversationTitle("  How does   Steve approach\nAI systems?  "), "How does Steve approach AI systems?");
  assert.equal(saved.savedConversationTitle(""), undefined);
  assert.ok(saved.savedConversationTitle("word ".repeat(40)).length <= 81);
  const base = Date.UTC(2026, 9, 12, 17), day = 864e5;
  const summary = { conversationId: "00000000-0000-4000-8000-000000000100", version: 1, messageCount: 4, createdAt: base, lastSavedMessageAt: base,
    updatedAt: base, expiresAt: base + 30 * day, lastNewSavedMessageId: "00000000-0000-4000-8000-000000000101" };
  assert.ok(saved.savedConversationSummarySchema.safeParse(summary).success, "a row without a title still parses");
  assert.ok(saved.savedConversationSummarySchema.safeParse({ ...summary, title: "How does Steve approach AI systems?" }).success);
  await withBrowser({ width: 1440, height: 900 }, async page => {
    await open(page, "saved-list");
    // Q16-D10 (intentional update, Oak approved titles 2026-10-18): the Worker titles live rows, so the gallery rows carry
    // titles too; the third row's title is removed here to keep the untitled path (an older row) covered.
    const titled = await page.locator(".oak-saved__group .oak-saved__open").first().textContent();
    assert.match(titled ?? "", /Steve/, "gallery rows carry their first question");
    await store(page, module => module.setOakWorkspaceFixture({ savedConversations: module.getOakWorkspace().savedConversations.map((row, index) =>
      index === 2 ? (({ title, ...rest }) => rest)(row) : row) }));
    await page.waitForTimeout(300);
    const rows = await page.locator(".oak-saved__group .oak-saved__row").evaluateAll(items => items.map(item => ({
      title: item.querySelector(".oak-saved__open")?.textContent?.trim(), meta: item.querySelector("[data-slot='item-description'], .ui-item__description")?.textContent ?? item.textContent })));
    assert.equal(rows[0].title, "How does Steve approach AI systems?");
    assert.notEqual(rows[0].title, rows[1].title, "two rows read differently");
    assert.match(rows[0].meta, /\d{1,2}:\d{2}|Today|Yesterday|\d/, "the date moves to the metadata line");
    assert.doesNotMatch(rows[2].title ?? "", /Steve/, "a row without a title keeps its date");
  });
});

test("Q16-D11 when a turn ends, the answer shows at once instead of waiting for the last thought to type out", async () => {
  await withBrowser({ width: 1440, height: 900 }, async page => {
    await open(page, "answer-points");
    const landed = await store(page, module => { const last = module.getOakWorkspace().messages.at(-1); return { answer: last.answer, text: last.text }; });
    await open(page, "reasoning-thoughts");
    await page.waitForFunction(() => !document.querySelector(".ui-stream-text[data-streaming]"), null, { timeout: 8000 });
    await store(page, module => {
      const messages = module.getOakWorkspace().messages, last = messages.at(-1), now = Date.now();
      const steps = last.steps.map(step => step.state === "running" ? { ...step, state: "done", endedAt: now } : step);
      module.setOakWorkspaceFixture({ messages: [...messages.slice(0, -1), { ...last, steps: [...steps, { id: "think-q16", operation: "think", state: "running", startedAt: now,
        thought: { title: "Weighing the credits", text: "A long thought that would take several seconds to type out at reading pace. ".repeat(6) } }] }] });
    });
    await page.waitForTimeout(600);
    const ended = await page.evaluate(() => performance.now());
    await store(page, (module, value) => {
      const messages = module.getOakWorkspace().messages, last = messages.at(-1), now = Date.now();
      module.setOakWorkspaceFixture({ pending: false, progress: "", messages: [...messages.slice(0, -1), { ...last, state: "complete", answer: value.answer, text: value.text,
        steps: last.steps.map(step => step.state === "running" ? { ...step, state: "done", endedAt: now } : step) }] });
    }, landed);
    await page.waitForSelector(".oak-turn__answer", { timeout: 5000 });
    const shownAfter = await page.evaluate(start => performance.now() - start, ended);
    assert.ok(shownAfter < 1500, `the answer appeared ${Math.round(shownAfter)}ms after the turn ended`);
  });
});

test("Q16-D5 an open Dictate panel re-reads voice status so Record never meets a stale one", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    let reads = 0;
    await page.route("**/api/oak/transcription/status", route => {
      reads += 1;
      const now = Date.now();
      return route.fulfill({ status: 200, contentType: "application/json", json: { schemaVersion: 1, service: "transcription", enabled: true, admission: "available", failure: "none",
        evidence: { settings: "verified", providerUsage: "unknown", localReservations: "verified" },
        allowance: { unit: "micro-usd", limit: null, providerObserved: null, reserved: 0, conservativeUsed: null, remainingBound: null, periodStart: null, periodEnd: null, reset: "unknown" },
        health: { accepted: 0, failed: 0, timedOut: 0, lastAttemptAt: null, lastSuccessAt: null, lastCheckAt: now, settingsObservedAt: now - 41 * 3_600_000, usageObservedAt: null },
        admissionBasis: "local-cap", localBudget: { limit: 200_000_000, reserved: 0, remainingBound: 200_000_000 } } });
    });
    await page.goto(galleryUrl, { waitUntil: "load" });
    await page.getByRole("button", { name: "Oak AI Agent" }).last().click();
    await page.getByRole("button", { name: "Dictate a message" }).click();
    await page.waitForTimeout(1500);
    assert.equal(await page.getByText("Voice input is off right now").count(), 0, "a $200 local-cap record a day old is available");
    const first = reads;
    await page.waitForTimeout(31_000);
    assert.ok(reads > first, `status re-read while open (${first} then ${reads})`);
  } finally { await browser.close(); }
});

test("Q16-D12 Dictate says it is checking while the first status read is in flight, never a false 'off'", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route("**/api/oak/transcription/status", async route => { await held; return route.fulfill({ status: 503, body: "" }); });
    await page.goto(galleryUrl, { waitUntil: "load" });
    await page.getByRole("button", { name: "Oak AI Agent" }).last().click();
    await page.getByRole("button", { name: "Dictate a message" }).click();
    await page.waitForTimeout(600);
    assert.equal(await page.getByText("Voice input is off right now").count(), 0, "no off card before the status answers");
    assert.equal(await page.locator(".oak-voice__checking[role='status']").count(), 1, "one quiet checking line");
    assert.equal(await page.getByRole("button", { name: "Record" }).count(), 0, "Record is not reachable before the status answers");
    assert.equal(await page.getByText("Oak turns your clip into text").count(), 0, "no voice-on promise while checking");
    release();
    await page.getByText("Voice input is off right now").waitFor({ timeout: 3000 });
    assert.equal(await page.locator(".oak-voice__checking").count(), 0, "a failed read settles to off");
  } finally { await browser.close(); }
});
