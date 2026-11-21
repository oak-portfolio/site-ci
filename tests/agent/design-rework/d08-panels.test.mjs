import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx, strictLoader } from "./load-tsx.mjs";

globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {} };
const root = path.resolve(import.meta.dirname, "../../..");
const voice = loadTsx("src/lib/oakVoiceCapture.ts");
const { OakVoiceCapture, OakVoiceLevel } = loadTsx("src/components/agent/OakVoiceCapture.tsx");
const workspace = loadTsx("src/lib/oakWorkspace.ts");
const { OakSavedConversations } = loadTsx("src/components/agent/OakSavedConversations.tsx");

/** Strict loader: every import must be named, so a direct Base UI import would fail here. */
const loadWith = strictLoader(import.meta.url);
const elements = tree => !tree || typeof tree !== "object" ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(elements)];
const text = element => React.Children.toArray(element.props.children).filter(child => typeof child === "string").join("");

const now = Date.now();
const status = () => ({ schemaVersion: 1, service: "transcription", enabled: true, admission: "available", failure: "none",
  evidence: { settings: "verified", providerUsage: "verified", localReservations: "verified" },
  allowance: { unit: "micro-usd", limit: 100_000, providerObserved: 0, reserved: 0, conservativeUsed: 0, remainingBound: 100_000, periodStart: null, periodEnd: null, reset: "unknown" },
  health: { lastCheckAt: Date.now(), settingsObservedAt: Date.now(), usageObservedAt: Date.now(), lastAttemptAt: null, lastSuccessAt: null, accepted: 0, failed: 0, timedOut: 0 } });
const available = () => ({ enabled: true, status: status(), fetch: async () => { throw new Error("no network in this test"); } });
const renderVoice = capture => renderToStaticMarkup(React.createElement(OakVoiceCapture, { configuration: available(), controller: capture, onUseTranscript() { throw new Error("render must not use the transcript"); } }));

test("D08-G4 the level comes from a meter on the recording stream and stops with the recording", async () => {
  const track = new EventTarget(); track.stop = () => {};
  const stream = { getTracks: () => [track] }, metered = []; let closed = 0;
  const capture = voice.createVoiceCapture(available, {
    supports: mime => mime === "audio/webm;codecs=opus",
    microphone: async () => stream,
    recorder: () => ({ state: "inactive", start() { this.state = "recording"; }, stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["clip"]) }); this.onstop?.(); } }),
    decode: async () => ({ channels: [new Float32Array([0.1])], sampleRate: 16_000 }),
    meter: input => { metered.push(input); return { read: () => 0.42, close: () => { closed++; } }; },
  });
  assert.equal(capture.level(), 0, "no level before recording");
  await capture.record();
  assert.equal(capture.getSnapshot().phase, "recording");
  assert.deepEqual(metered, [stream], "the meter listens to the same stream the recorder records");
  assert.equal(capture.level(), 0.42);
  capture.stop();
  assert.equal(capture.getSnapshot().phase, "clip-ready");
  assert.equal(capture.level(), 0);
  assert.equal(closed, 1, "the analyser closes when the clip is captured");
  capture.dispose();
});

test("D08-G4 recording shows an elapsed timer and a live level meter", () => {
  const capture = voice.createVoiceCapture(available);
  capture.setFixture({ phase: "recording", seconds: 12, levels: [0.2, 0.9] });
  assert.deepEqual([capture.level(), capture.level(), capture.level()], [0.2, 0.9, 0.2], "fixture levels replay only through level()");
  const html = renderVoice(capture);
  assert.match(html, /aria-label="12 of 30 seconds">0:12/);
  assert.match(html, /role="meter" aria-label="Microphone level"/);
  assert.match(html, /Stop recording/);
  assert.doesNotMatch(html, /<textarea|>Use transcript<\/button>/, "no review step while recording");
  const meter = renderToStaticMarkup(React.createElement(OakVoiceLevel, { levels: [0, 0.5, 1, 4] }));
  assert.deepEqual([...meter.matchAll(/data-level="(\d)"/g)].map(match => match[1]), ["0", "4", "8", "8"], "levels map to nine clamped steps");
  assert.match(meter, /aria-valuenow="100"/, "the announced value is clamped like the bars");
  assert.equal((renderVoice(capture).match(/Dictate a message/g) ?? []).length, 0, "the WorkflowPanel owns the only title");
  capture.dispose();
});

test("D08-G4 transcribing shows progress, then review holds an editable transcript before Use", () => {
  const capture = voice.createVoiceCapture(available);
  capture.setFixture({ phase: "transcribing", seconds: 18 });
  const busy = renderVoice(capture);
  assert.match(busy, /Transcribing your clip/);
  assert.match(busy, /data-slot="spinner"/);
  assert.doesNotMatch(busy, /role="meter"/);
  assert.doesNotMatch(busy, /Deepgram\./, "the status line names no vendor");
  capture.setFixture({ phase: "review", transcript: "How did Steve choose what to keep?" });
  capture.edit("How did Steve choose what memory keeps?");
  const review = renderVoice(capture);
  assert.match(review, /<textarea[^>]*>How did Steve choose what memory keeps\?<\/textarea>/);
  assert.match(review, /<button[^>]*>Use transcript<\/button>/);
  assert.doesNotMatch(review, /<button[^>]*disabled=""[^>]*>Use transcript/);
  capture.edit("x".repeat(4001));
  assert.match(renderVoice(capture), /<button[^>]*disabled=""[^>]*>Use transcript/, "an over-limit transcript cannot be used");
  capture.dispose();
});

const day = 24 * 60 * 60_000;
const row = (index, daysAgo) => ({ conversationId: `00000000-0000-4000-8000-00000000010${index}`, version: index + 1, messageCount: 4 + index * 2,
  createdAt: now - daysAgo * day, lastSavedMessageAt: now - daysAgo * day, updatedAt: now - daysAgo * day, expiresAt: now - daysAgo * day + 30 * day, lastNewSavedMessageId: `m${index}` });

// D116 re-tick: each row is a ui/item whose title opens it; export and delete live in the row's "Conversation actions" menu.
test("D08-G3 saved conversations render as rows with date, title and open, export and delete actions", () => {
  const rows = [row(0, 0), row(1, 1), row(2, 5)];
  workspace.setOakWorkspaceFixture({ authStatus: { configured: true, kind: "account", phase: "ready" }, historyOpen: true, historyLoaded: true,
    savedConversations: rows, historyLifecycle: { target: null, operationId: null, phase: "idle", notice: null } });
  const html = renderToStaticMarkup(React.createElement(OakSavedConversations, { state: workspace.getOakWorkspace() }));
  const items = html.split(/<div[^>]*data-slot="item"[^>]*>/).slice(1);
  assert.equal(items.length, 3);
  for (const [index, item] of items.entries()) {
    assert.match(item, new RegExp(`<time dateTime="${new Date(rows[index].createdAt).toISOString()}">`), "each row carries its date");
    // Review v4 supersedes D90: the group header names the day, so no row repeats it as a calendar tile.
    assert.doesNotMatch(item, /oak-saved__date/);
    assert.match(item, new RegExp(`${rows[index].messageCount} messages`));
    for (const name of ["Open conversation from", "Conversation actions"]) assert.match(item, new RegExp(`aria-label="${name}`));
  }
  assert.match(items[0], /Today, /); assert.match(items[1], /Yesterday, /);
  assert.doesNotMatch(html, /Back to conversation|Return to/, "no nested return action inside the panel");
});

test("D08-G3 delete goes through ui/dialog and only its Delete confirms the versioned deletion", () => {
  const calls = [];
  const spy = name => (...args) => { calls.push([name, ...args]); };
  const mod = loadWith("src/components/agent/OakSavedLifecycleControls.tsx", {
    react: { useRef: current => ({ current }) }, "react/jsx-runtime": jsx,
    "@/components/ui/button": { Button: "button" }, "@/components/ui/Icon": { Icon: "svg" }, "./OakActivitySprite": { OakSprite: "oak-sprite" },
    "@/components/ui/menu": { Menu: "ui-menu", MenuContent: "ui-menu-content", MenuItem: "ui-menu-item", MenuTrigger: "ui-menu-trigger" },
    "@/components/ui/tooltip": { Tooltip: "ui-tooltip", TooltipTrigger: "ui-tooltip-trigger", TooltipContent: "ui-tooltip-content" },
    "@/lib/oakMeaningIcons": { oakMeaningIcons: { "panel.row-actions": "moreHorizontal" } },
    "@/components/ui/dialog": { Dialog: "ui-dialog", DialogContent: "ui-dialog-content", DialogTitle: "h2", DialogDescription: "p", DialogFooter: "footer" },
    "@/lib/oakWorkspace": { beginOakSavedDeletion: spy("begin"), confirmOakSavedDeletion: spy("confirm"), dismissOakSavedDeletion: spy("dismiss"),
      exportOakSavedHistory: spy("export"), reviewOakSavedDeletion: spy("review") },
  });
  const target = row(0, 0);
  const actions = elements(React.createElement(React.Fragment, null, mod.OakSavedConversationActions({ item: target, disabled: false })));
  // D116: export and delete are the row menu's two commands.
  assert.deepEqual(actions.filter(element => element.type === "ui-menu-item").map(text), ["Export JSON", "Delete saved conversation"]);
  actions.find(element => element.type === "ui-menu-item" && text(element) === "Delete saved conversation").props.onClick();
  assert.deepEqual(calls, [["begin", target]], "the row's delete opens the confirmation and deletes nothing");

  const dialog = phase => mod.OakSavedDeletionConfirmation({ state: { historyLifecycle: { target: { ...target, version: 3 }, operationId: "op", phase, notice: null } } });
  const confirming = dialog("confirming");
  assert.equal(confirming.type, "ui-dialog"); assert.equal(confirming.props.open, true);
  const tree = elements(confirming);
  assert.ok(tree.some(element => element.type === "ui-dialog-content" && element.props.initialFocus), "focus starts on the safe choice");
  assert.ok(tree.some(element => element.type === "oak-sprite" && element.props.pose === "delete-review"));
  assert.match(renderToStaticMarkup(confirming.props.children.props.children), /saved version 3/);
  const button = label => tree.find(element => element.type === "button" && text(element) === label);
  calls.length = 0;
  button("Keep").props.onClick(); confirming.props.onOpenChange(false);
  assert.deepEqual(calls, [["dismiss"], ["dismiss"]], "Keep and Escape dismiss without deleting");
  button("Delete").props.onClick();
  assert.deepEqual(calls.at(-1), ["confirm"]);

  const deleting = dialog("deleting"); calls.length = 0;
  deleting.props.onOpenChange(false);
  assert.deepEqual(calls, [], "an in-flight deletion cannot be dismissed");
  assert.ok(elements(deleting).filter(element => element.type === "button").every(element => element.props.disabled));
  assert.equal(dialog("idle").props.open, false);
  assert.equal(dialog("exporting").props.open, false);
});

test("D08-G2 removing a staged file after the documents panel closes and reopens keeps the other files and their sizes", () => {
  const { createOakDocumentsWorkspace } = loadTsx("src/lib/oakDocumentsWorkspace.ts");
  const store = createOakDocumentsWorkspace();
  const owner = { conversationId: "conversation-fixture", accountEpoch: 1 };
  const file = (name, bytes) => new File(["x".repeat(bytes)], name);
  store.open(owner);
  store.stageFiles([file("a.txt", 3), file("b.docx", 5), file("c.pdf", 7)], owner);
  store.close();
  store.open(owner);
  assert.deepEqual(store.snapshot().stagedFiles, ["a.txt", "b.docx", "c.pdf"], "staged rows survive a panel remount");
  store.unstageFile(0, owner);
  assert.deepEqual(store.snapshot().stagedFiles, ["b.docx", "c.pdf"]);
  assert.deepEqual(store.snapshot().stagedSizes, [5, 7]);
});
