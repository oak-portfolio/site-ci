import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import { loadTsx } from "../design-rework/load-tsx.mjs";

globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, addEventListener() {}, removeEventListener() {} };
const workspace = loadTsx("src/lib/oakWorkspace.ts");
const { OakSavedConversations } = loadTsx("src/components/agent/OakSavedConversations.tsx");
const lifecycle = loadTsx("src/components/agent/OakSavedLifecycleControls.tsx");
const account = loadTsx("src/components/agent/OakAccountContinuation.tsx");

const css = postcss.parse(readFileSync("src/styles/oakAgent.css", "utf8"));
const declarations = (selector) => {
  const found = {};
  css.walkRules(rule => { if (rule.selector.split(",").map(part => part.trim()).includes(selector)) rule.walkDecls(decl => { found[decl.prop] = decl.value; }); });
  return found;
};

const day = 86_400_000;
const at = (daysAgo) => { const date = new Date(); date.setHours(9, 40, 0, 0); return date.getTime() - daysAgo * day; };
const row = (index, daysAgo) => ({ conversationId: `00000000-0000-4000-8000-00000000020${index}`, version: 1, messageCount: 2 + index * 2,
  createdAt: at(daysAgo), lastSavedMessageAt: at(daysAgo), updatedAt: at(daysAgo), expiresAt: at(daysAgo) + 30 * day, lastNewSavedMessageId: `m${index}` });
const ready = { configured: true, kind: "account", phase: "ready", role: "visitor", publishableKey: "pk_test_x", purpose: "recruiting" };
const idle = { target: null, operationId: null, phase: "idle", notice: null };
const clean = { historyOpen: false, historyLoaded: false, historyPending: false, historyError: null, historyCursor: null, savedRecord: null, saveError: null,
  savePending: false, pending: false, authPending: false, authOpen: false, authReauthenticate: false, authError: null, savedConversations: [] };
const render = (fields) => {
  workspace.setOakWorkspaceFixture({ ...clean, authStatus: ready, historyLifecycle: idle, conversationId: "00000000-0000-4000-8000-000000000999",
    messages: [{ id: "u1", role: "user", text: "q" }, { id: "a1", role: "assistant", state: "complete", text: "a" }], ...fields });
  return renderToStaticMarkup(createElement(OakSavedConversations, { state: workspace.getOakWorkspace() }));
};

test("Q12-G1 saved rows fall into Today, Yesterday, Previous 7 days and Older inset groups, in that order", () => {
  const rows = [row(0, 0), row(1, 1), row(2, 3), row(3, 12), row(4, 40)];
  const html = render({ historyOpen: true, historyLoaded: true, historyPageCount: 1, savedConversations: rows });
  const headers = [...html.matchAll(/<h3[^>]*class="oak-saved__group-header"[^>]*>([^<]+)<\/h3>/g)].map(match => match[1]);
  assert.deepEqual(headers, ["Today", "Yesterday", "Previous 7 days", "Older"]);
  const groups = html.split(/<section class="oak-saved__group"/).slice(1);
  assert.deepEqual(groups.map(group => (group.match(/data-slot="item"/g) ?? []).length), [1, 1, 1, 2], "each row sits in its own day's group");
  for (const group of groups) assert.match(group, /<div class="oak-saved__inset"><div role="list" data-slot="item-group" class="ui-item-group">/, "one inset list per group");
  // The group heads its list: the section is named by its header.
  assert.match(groups[0], /^ aria-labelledby="oak-saved-group-today"/);
});

test("Q12-G1 each row reads a relative date and carries one row action", () => {
  const rows = [row(0, 0), row(1, 1), row(2, 3), row(3, 12)];
  const html = render({ historyOpen: true, historyLoaded: true, historyPageCount: 1, savedConversations: rows });
  const items = html.split(/<div[^>]*data-slot="item"[^>]*>/).slice(1);
  assert.equal(items.length, 4);
  assert.match(items[0], /<time[^>]*>Today, /);
  assert.match(items[1], /<time[^>]*>Yesterday, /);
  const weekday = new Date(rows[2].createdAt).toLocaleDateString(undefined, { weekday: "long" });
  assert.match(items[2], new RegExp(`<time[^>]*>${weekday}, `), "within the week the row names its weekday");
  assert.doesNotMatch(items[3], /<time[^>]*>(Today|Yesterday)/);
  for (const item of items) {
    // The row itself opens; its one trailing control is the actions menu.
    assert.equal((item.match(/aria-label="Open conversation from/g) ?? []).length, 1);
    assert.equal((item.match(/aria-label="Conversation actions"/g) ?? []).length, 1);
  }
  // Helper edges: buckets follow calendar days in the visitor's zone, not 24-hour windows.
  const now = new Date(); now.setHours(0, 30, 0, 0);
  assert.equal(lifecycle.savedGroup(now.getTime() - 2 * 3_600_000, now.getTime()), "Yesterday");
  assert.equal(lifecycle.savedGroup(now.getTime() - 7 * day, now.getTime()), "Older");
});

test("Q12-G1 the inset group owns the sheet radius and clips flat rows split by a hairline", () => {
  const inset = declarations(".oak-saved__inset");
  assert.equal(inset["border-radius"], "var(--oak-r-sheet)");
  assert.equal(inset.overflow, "clip");
  const flat = declarations(".oak-saved__inset .oak-saved__row");
  assert.equal(flat["border-radius"], "0");
  assert.equal(flat.border, "0");
  assert.match(declarations(".oak-saved__inset .oak-saved__row + .oak-saved__row")["border-top"], /var\(--line-soft\)/);
  // A clipped group would cut an outside focus ring, so the row's ring sits inside its edge.
  assert.equal(declarations(".oak-saved__row:has(.oak-saved__open:focus-visible)")["outline-offset"], "-2px");
});

test("Q12-G2 loading keeps the list's shape: a header bar and three skeleton rows inside the same inset group", () => {
  const html = render({ historyOpen: true, historyPending: true, historyLoaded: false, historyPageCount: 0, savedConversations: [] });
  const start = html.indexOf('<div class="oak-saved__group" data-loading=""');
  assert.ok(start >= 0, "a loading group renders");
  const loading = html.slice(start);
  assert.match(loading, /^<div class="oak-saved__group" data-loading="" aria-hidden="true">/);
  assert.match(loading, /oak-saved__group-header--skeleton/, "the header holds its place");
  assert.match(loading, /<div class="oak-saved__inset">/, "inside the same inset group as the list");
  assert.equal((loading.match(/oak-saved__row oak-saved__row--skeleton" aria-hidden="true"/g) ?? []).length, 3);
  assert.match(html, /role="status">Loading saved history/, "the wait is announced once");
  assert.doesNotMatch(html, /No saved conversations yet/);
  // No radius mismatch: skeleton rows take no corner of their own, so the group's sheet radius is the only one.
  assert.equal(declarations(".oak-saved__row--skeleton")["border-radius"], undefined);
});

test("Q12-G2 the empty list says what saving does and offers Save once", () => {
  const html = render({ historyOpen: true, historyLoaded: true, historyPageCount: 1, savedConversations: [] });
  const empty = html.slice(html.indexOf('class="oak-saved__none"'), html.indexOf("oak-saved__terms"));
  assert.match(empty, /No saved conversations yet/);
  assert.match(empty, /Saving keeps a conversation for 30 days, so you can reopen it here/);
  const save = empty.match(/<button[^>]*>(?:(?!<\/button>).)*Save this conversation<\/button>/)?.[0];
  assert.ok(save, "the empty list offers Save");
  assert.doesNotMatch(save, /disabled/, "Save is live when the conversation can be saved");
  assert.equal((html.match(/>Save<\/button>|Save this conversation<\/button>/g) ?? []).length, 1, "one Save on screen, not two");
  // Once saved, the empty list stops offering Save.
  const saved = render({ historyOpen: true, historyLoaded: true, historyPageCount: 1, savedConversations: [],
    savedRecord: { ...row(0, 0), messages: [] } });
  assert.doesNotMatch(saved, /Save this conversation/);
  assert.equal(declarations(".oak-saved__none")["border-radius"], "var(--oak-r-sheet)", "the empty group matches the list's radius");
});

const signIn = (fields = {}) => {
  workspace.setOakWorkspaceFixture({ ...clean, historyLifecycle: idle, messages: [{ id: "u1", role: "user", text: "q" }], draft: "And what did Steve own?", authOpen: false, authReauthenticate: false,
    authStatus: { configured: true, kind: "guest", phase: "sign-in-required", role: "visitor", publishableKey: "pk_test_x", purpose: null }, ...fields });
  const state = workspace.getOakWorkspace();
  return { state, html: renderToStaticMarkup(createElement(account.OakAccountContinuation, { state })) };
};

test("Q12-G3 the sign-in prompt states one concrete benefit, saved chats, and never more answers", () => {
  const { html } = signIn();
  const benefit = html.match(/<p class="oak-account__benefit">([^<]+)<\/p>/)?.[1];
  assert.ok(benefit, "the prompt carries a benefit line");
  assert.equal(benefit, `${account.oakSignInBenefit} ${account.oakSignInKeeps}`);
  assert.match(benefit, /save conversations/);
  assert.match(benefit, /conversation and draft stay/);
  assert.doesNotMatch(html, /more answers|for more|extra answers|answers are the same/i, "ADR 0002: signing in adds saved chats, not answers");
  assert.equal((html.match(/<p[ >]/g) ?? []).length, 1, "one line of copy, no second pitch");
  assert.match(html, />Sign in to continue<\/button>/);
});

test("Q12-G3 the prompt sits inline: the conversation and the draft stay in view until the visitor chooses Sign in", () => {
  const { state, html } = signIn();
  assert.match(html, /^<section class="oak-account-intake" aria-labelledby="oak-account-heading">/, "an inline section, not a workflow panel");
  assert.doesNotMatch(html, /oak-workflow/);
  // The transcript shows on the chat surface, and the draft is untouched by the prompt.
  assert.equal(workspace.oakSurface(state, false), "chat");
  assert.equal(state.draft, "And what did Steve own?");
  const conversation = readFileSync("src/components/agent/OakConversation.tsx", "utf8");
  // Matches the source since the advice panel took the reading area (the old regex was stale on main before the v3 review).
  assert.match(conversation, /const transcriptHidden = surface !== "chat";/);
  assert.match(conversation, /<OakComposer state=\{state\}/, "the composer renders under every surface");
  // Nothing about the prompt lifts it over the window.
  for (const selector of [".oak-account-intake", "section.oak-account-intake:not(.oak-workflow)"]) {
    assert.notEqual(declarations(selector).position, "fixed", selector);
    assert.notEqual(declarations(selector).inset, "0", selector);
  }
  // The unused allowance-card path no longer pitches more answers either.
  assert.doesNotMatch(readFileSync("src/components/agent/OakTurn.tsx", "utf8"), /Sign in for more/);
});
