import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

// D128: one tool suggested from inside an answer. D130: every UI-generated answer block breathes on one card anatomy.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const read = file => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);
};
const store = (page, fn, arg) => page.evaluate(async ([source, value]) => {
  const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => /\/src\/lib\/oakWorkspace\.ts(\?|$)/.test(name));
  const workspace = await import(url);
  return new Function("workspace", "value", `return (${source})(workspace, value);`)(workspace, value);
}, [fn.toString(), arg]);
const withPage = async (run) => {
  const browser = await chromium.launch();
  try { await run(await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" })); } finally { await browser.close(); }
};

const sourced = { kind: "sourced" }, gap = { kind: "gap" }, role = { kind: "role-fit" }, document = { kind: "document" };
const adviceOffer = { kind: "advice", contactOffer: true };

test("D128-G1 the next step comes from the visitor's own words and the answer kind, never from model prose", () => {
  const { oakNextStep } = loadTsx("src/lib/oakNextStep.ts");
  const action = (question, answer, preference = "open") => oakNextStep(question, answer, preference)?.action ?? null;
  assert.equal(action("Is Steve a good fit for a Staff Design Engineer role?", sourced), "role");
  assert.equal(action("We have a job post for a frontend position, would he match?", gap), "role");
  assert.equal(action("How can I contact Steve about an interview?", sourced), "brief");
  assert.equal(action("Is Steve available, and what are his rates?", sourced), "brief");
  assert.equal(action("Can you compare my resume with his?", sourced), "documents");
  assert.equal(action("I have a job description I have here, does it match?", sourced), "documents", "a document beats the word job");
  assert.equal(action("Should we build retrieval first for our team?", sourced), "advice");
  assert.equal(action("How would you approach an agent for our docs?", gap), "advice");
  assert.equal(action("What did Steve build at EcoSmartLoop?", sourced), null, "a plain work question gets no card");
  assert.equal(action("How does Steve handle rate limiting?", sourced), null, "rate limiting is not a pay question");
  assert.equal(action("Which benefits did the redesign bring?", sourced), null, "words are matched whole");
  // The tool the answer already is, or an offer already on screen, is never suggested again.
  assert.equal(action("Is Steve a fit for this role?", role), null);
  assert.equal(action("Can you read my resume?", document), null);
  assert.equal(action("Should we start with retrieval?", adviceOffer), null, "advice never suggests advice");
  assert.equal(action("Should we hire Steve to talk this through?", adviceOffer), null, "the advice card already offers the brief");
  assert.equal(action("Should we hire Steve to talk this through?", adviceOffer, "declined"), null, "and a declined offer stays declined");
  for (const kind of ["contact", "declined"]) assert.equal(action("Can I email Steve about a role?", { kind }), null, `${kind} answers carry their own way forward`);
  // The contact-reason card already has its two buttons, so a third way to the brief under it is one too many.
  assert.equal(action("How do I contact Steve?", { kind: "contact", reason: "contact" }), null);
  assert.equal(action("Is Steve a fit for this role?", undefined), null, "no answer, no card");
  assert.equal(action("Can I email Steve?", sourced, "declined"), null, "a visitor who declined contact is not offered a brief");
  const step = oakNextStep("Is Steve a fit for this role?", sourced, "open");
  assert.deepEqual(Object.keys(step).sort(), ["action", "hint", "icon", "title", "tone"]);
  assert.equal(step.title, "Compare a role");
});

test("D128-G2 the card's tile matches the Tools menu row it opens, and the module is registered", () => {
  const { oakNextSteps } = loadTsx("src/lib/oakNextStep.ts");
  const menu = read("src/components/agent/OakTaskMenu.tsx");
  for (const [action, step] of Object.entries(oakNextSteps)) {
    const row = menu.match(new RegExp(`\\{ action: "${action}",[^}]*icon: "([^"]+)", tone: "([^"]+)" \\}`));
    // R11 (intentional update): Documents left Tools for the composer's own attach button; the other cards still mirror their row.
    if (!row && action === "documents") continue;
    assert.ok(row, `${action} is a Tools menu row`);
    assert.equal(step.icon, row[1], `${action} uses the menu's icon`);
    assert.equal(step.tone, row[2], `${action} uses the menu's tone`);
  }
  assert.match(read("scripts/design-policy/policy.mjs"), /"OakNextStep\.tsx": \{ contract: "portfolio\/token-contract"/);
  const turn = read("src/components/agent/OakTurn.tsx");
  assert.ok(turn.indexOf("<OakNextStep") > turn.indexOf("message.cards.map") && turn.indexOf("<OakNextStep") < turn.indexOf("<MotionFooter"),
    "the card sits after the answer and before the action row");
});

test("D128-G3 a role question shows one card that opens the role panel prefilled, and sends nothing", async () => {
  await withPage(async page => {
    await open(page, "answer-sourced");
    const question = "Is Steve a good fit for a Staff Design Engineer role?";
    await store(page, (workspace, text) => {
      const messages = workspace.getOakWorkspace().messages;
      workspace.setOakWorkspaceFixture({ messages: messages.map((message, index) => index === 0 ? { ...message, text } : message) });
    }, question);
    const card = page.locator(".oak-turn__answer .oak-next-step");
    await card.first().waitFor({ state: "visible", timeout: 8000 });
    assert.equal(await card.count(), 1, "one card per answer");
    assert.match(await card.innerText(), /Compare a role/);
    const before = await store(page, workspace => ({ count: workspace.getOakWorkspace().messages.length, pending: workspace.getOakWorkspace().pending }));
    await card.click();
    await page.waitForTimeout(300);
    const after = await store(page, workspace => { const state = workspace.getOakWorkspace();
      return { count: state.messages.length, pending: state.pending, surface: workspace.getOakSurface(), intent: state.roleDraft?.intent }; });
    assert.equal(after.surface, "role", "the role panel opens");
    assert.equal(after.intent, question, "its comparison is the visitor's own question");
    assert.deepEqual({ count: after.count, pending: after.pending }, before, "nothing was sent");
  });
});

test("D128-G4 no card when no tool applies or the answer already offers the way forward", async () => {
  await withPage(async page => {
    for (const state of ["answer-sourced", "advice", "role-fit-answer", "answer-document", "contact-handoff", "answer-declined"]) {
      await open(page, state);
      await page.waitForTimeout(600);
      assert.equal(await page.locator(".oak-next-step").count(), 0, `${state}: no next-step card`);
    }
  });
});

/** Every answer card, measured in the page: its inner padding, icon-to-text room, room between rows and line height. */
const measureCards = () => {
  const cards = [...document.querySelectorAll(".oak-turn__answer :is(.oak-advice-card, .oak-role-review, .oak-document-answer, .oak-turn__handoff, .oak-message__card, .oak-next-step)")];
  const problems = [];
  const shown = node => { const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0; };
  const textBox = node => { const range = document.createRange(); range.selectNodeContents(node); return range.getBoundingClientRect(); };
  // A row's visible content: screen-reader-only text is a 1px absolute box whose place says nothing about spacing.
  const rowBox = node => {
    const parts = [...node.childNodes].filter(child => !(child.nodeType === 1 && child.matches(".sr-only, figcaption:empty")))
      .map(child => { if (child.nodeType === 1) return child.getBoundingClientRect(); const r = document.createRange(); r.selectNodeContents(child); return r.getBoundingClientRect(); })
      .filter(rect => rect.width > 0 && rect.height > 0);
    return parts.length ? { top: Math.min(...parts.map(r => r.top)), bottom: Math.max(...parts.map(r => r.bottom)) } : textBox(node);
  };
  for (const card of cards.filter(shown)) {
    const name = card.className.split(" ")[0];
    const outer = card.getBoundingClientRect();
    for (const leaf of card.querySelectorAll("p, li, h3, h4, blockquote, figcaption, summary, button, a")) {
      if (!shown(leaf) || leaf.closest(".sr-only")) continue;
      // Controls are measured by their own edge; text by where its words sit (a padded paragraph can be a whole section).
      const box = /^(BUTTON|A)$/.test(leaf.tagName) ? leaf.getBoundingClientRect() : textBox(leaf);
      const inset = Math.min(box.left - outer.left, outer.right - box.right, box.top - outer.top, outer.bottom - box.bottom);
      if (inset < 15.5) problems.push(`${name}: ${leaf.tagName.toLowerCase()} "${leaf.textContent.trim().slice(0, 24)}" is ${Math.round(inset)}px from the edge`);
      const style = getComputedStyle(leaf);
      if (/^(P|LI|BLOCKQUOTE)$/.test(leaf.tagName) && parseFloat(style.lineHeight) / parseFloat(style.fontSize) < 1.4)
        problems.push(`${name}: ${leaf.tagName.toLowerCase()} line height ${style.lineHeight} at ${style.fontSize}`);
    }
    for (const icon of card.querySelectorAll(":is(.oak-answer-tile, .oak-art-tile, .oak-advice-card__note > svg)")) {
      const next = icon.nextElementSibling;
      if (!next || !shown(icon)) continue;
      const room = textBox(next).left - icon.getBoundingClientRect().right;
      if (room < 11.5) problems.push(`${name}: ${Math.round(room)}px between icon and text`);
    }
    for (const selector of [".oak-role-review__row", ".oak-advice-card > *", ".oak-advice-card__list li", ".oak-document-answer__quote", ".oak-advice-card__evidence .oak-answer__point"]) {
      const rows = [...card.querySelectorAll(selector)].filter(row => row.parentElement === card.querySelector(selector)?.parentElement && shown(row));
      for (let index = 1; index < rows.length; index++) {
        const room = rowBox(rows[index]).top - rowBox(rows[index - 1]).bottom;
        if (room < 11.5) problems.push(`${name}: ${selector} rows ${Math.round(room)}px apart`);
      }
    }
  }
  const kind = document.querySelector(".oak-turn__kind");
  if (kind) {
    const tile = kind.querySelector(".oak-answer-tile");
    if (!tile) problems.push("the answer kind has no tile");
    else {
      const size = tile.getBoundingClientRect().width;
      if (size < 31.5 || size > 36.5) problems.push(`the answer kind tile is ${size}px`);
      const room = textBox(tile.nextElementSibling).left - tile.getBoundingClientRect().right;
      if (room < 11.5) problems.push(`the answer kind label is ${Math.round(room)}px from its tile`);
    }
  }
  return { count: cards.length, problems };
};

test("D130-G1 every answer card keeps 16px inside, 12px between icon and text and 12px between rows", async () => {
  await withPage(async page => {
    const problems = [];
    for (const state of ["advice", "role-fit-answer", "answer-document", "contact-handoff", "answer-declined", "answer-gap", "answer-sourced"]) {
      await open(page, state);
      await page.waitForTimeout(800);
      // Open every fold so its rows are measured too.
      await page.evaluate(() => document.querySelectorAll(".oak-turn__answer details").forEach(node => { node.open = true; }));
      const found = await page.evaluate(measureCards);
      if (!["answer-gap", "answer-sourced"].includes(state)) assert.ok(found.count > 0, `${state}: an answer card is on screen`);
      problems.push(...found.problems.map(problem => `${state}: ${problem}`));
    }
    assert.deepEqual(problems, []);
  });
});

test("D130-G2 answer cards use the radius tokens: sheet outside, card inside, capsules for chips and buttons", async () => {
  const css = read("src/styles/oakAgent.css");
  const start = css.indexOf("/* D128 D130 answer cards */");
  assert.ok(start > 0, "the block exists");
  // Review v4 supersedes the slice-to-end-of-file: the block ends where D132 (tools menu) begins, so the deliberate header
  // and greeting gradients later in the file are not read as answer-card styles.
  const end = css.indexOf("/* D132:", start);
  assert.ok(end > start, "the answer-card block ends before D132");
  const block = css.slice(start, end);
  assert.doesNotMatch(block, /border-radius:\s*[1-9]/, "no literal radius in the block (0 only removes one)");
  assert.doesNotMatch(block, /linear-gradient/, "no gradients on answer cards");
  // And no answer-card rule anywhere in the file paints a gradient.
  const cardRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector, body]) => /oak-(answer-card|advice-card|role-review|document-answer|message__card|turn__handoff|next-step)/.test(selector) && /linear-gradient/.test(body))
    .map(([, selector]) => selector.trim());
  assert.deepEqual(cardRules, [], "no answer-card rule uses a gradient");
  await withPage(async page => {
    const radius = async (state, selector) => { await open(page, state);
      return page.locator(selector).first().evaluate(node => parseFloat(getComputedStyle(node).borderTopLeftRadius)); };
    assert.equal(await radius("advice", ".oak-advice-card"), 48); // R14 intentional update: the 48px frame step (ticket 25)
    // R17 (intentional update, Oak review v14 advice/03-answer): the next step is a row of the frame, not a nested gray card.
    assert.equal(await page.locator(".oak-advice-card__next").first().evaluate(node => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)", "the next step is unframed");
    assert.equal(await radius("role-fit-answer", ".oak-role-review"), 48); // R14 intentional update: the 48px frame step (ticket 25)
    assert.ok(await radius("role-fit-answer", ".oak-role-review .oak-source-chip__trigger") > 100, "source chips are capsules");
    assert.equal(await radius("answer-document", ".oak-document-answer"), 48); // R14 intentional update: the 48px frame step (ticket 25)
    assert.equal(await radius("contact-handoff", ".oak-turn__handoff"), 48); // R14 intentional update: the 48px frame step (ticket 25)
  });
});

test("D130-G3 advice and role-fit sources use the inline chip, not numbered pills", () => {
  const { OakAdviceAnswer } = loadTsx("src/components/agent/OakAdviceAnswer.tsx");
  const { OakRoleFitReview } = loadTsx("src/components/agent/OakRoleFitReview.tsx");
  const cite = { documentId: "work:ecosmartloop", passageId: "p", sectionId: "s", url: "https://steveoak.com/work/ecosmartloop/#ownership" };
  const identity = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "f", hardPolicyVersion: "f", knowledgeRevision: "f", operations: [] };
  const claim = { id: "c1", text: "Steve built the app around the classifier.", citations: [cite] };
  const advice = renderToStaticMarkup(createElement(OakAdviceAnswer, { answer: { ...identity, kind: "advice", scope: "supported-expertise",
    proposal: { recommendation: "Start small.", assumptions: ["A"], tradeoffs: ["B"], nextStep: "List questions." }, uncertainty: "General.", evidence: [claim], contactOffer: false },
    contactPreference: "open", onBrief() {}, onDecline() {} }));
  const roleFit = renderToStaticMarkup(createElement(OakRoleFitReview, { onContact() {}, answer: { ...identity, kind: "role-fit", contactTopics: [],
    rows: [{ id: "r", requirement: { text: "React", start: 0, end: 5 }, status: "demonstrated", evidence: [claim], gap: null, questions: [] }] } }));
  for (const [name, html] of [["advice", advice], ["role fit", roleFit]]) {
    assert.match(html, /class="oak-source-chip"/, `${name} uses the source chip`);
    assert.doesNotMatch(html, /oak-message__sources|oak-citation/, `${name} has no numbered pills`);
  }
  for (const file of ["OakAdviceAnswer", "OakRoleFitReview"]) assert.doesNotMatch(read(`src/components/agent/${file}.tsx`), /OakCitations/);
});

test("D130-G4 validated text stays exactly as given in every redesigned card", () => {
  const { OakDocumentAnswer } = loadTsx("src/components/agent/OakDocumentAnswer.tsx");
  const quote = "You will build agent interfaces with React and TypeScript.";
  const html = renderToStaticMarkup(createElement(OakDocumentAnswer, { answer: { kind: "document", claims: [{ id: "d1", quote,
    citation: { sourceId: "fixture:doc:section-1", label: "Document 1", sectionId: "section-1", start: 0, end: quote.length } }],
    coverage: { scope: "selected-spans-only", offsetUnit: "utf16", includedUtf16: 58, availableUtf16: 58, omittedUtf16: 0, quotedUtf16: 58, extractionCompleteness: "complete" } } }));
  assert.match(html, new RegExp(`<blockquote[^>]*>${quote}</blockquote>`), "the quote is exact");
  assert.match(html, /class="oak-document-answer__quote"/, "each quote is a row");
  // v3 review (intentional update): the on-screen note is plainer; Copy and saved exports keep the contract's wording.
  assert.match(html, /These are your document’s words\. They don’t verify Steve’s experience\./);
  // Review v7 (intentional update): the share moved under the file name, as one quiet meta line.
  assert.match(html, /100% of your selection quoted/, "coverage reads as a share, not character counts");
});
