import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTsx, strictLoader } from "../design-rework/load-tsx.mjs";

// R10: the composer's meter is the context window, read from the Worker's data-context part.
const { parseOakOutput } = loadTsx("src/lib/oakWorkspaceTransport.ts");
const requestId = "7f0c2a52-8a0e-4c4e-9a43-1d6f0e6f2b11";
const reading = { requestId, conversationBytes: 6_225, limitBytes: 15_360, inputTokens: 1_834 };

test("R10 parseOakOutput keeps a strict data-context reading for this request", () => {
  assert.deepEqual(parseOakOutput([{ type: "data-context", data: reading }], requestId).context, reading);
  // No reading yet: the field is absent, so older outputs keep their exact shape.
  assert.equal("context" in parseOakOutput([], requestId), false);
});

test("R10 a mismatched or malformed reading is ignored and never fails the turn", () => {
  for (const data of [
    { ...reading, requestId: "11111111-2222-4333-8444-555555555555" },
    { ...reading, extra: 1 },
    { ...reading, conversationBytes: -1 },
    { ...reading, limitBytes: 0 },
    { ...reading, inputTokens: 1.5 },
    { requestId, conversationBytes: 10 },
    null,
  ]) {
    const output = parseOakOutput([{ type: "data-context", data }], requestId);
    assert.equal(output.context, undefined, JSON.stringify(data));
  }
  // data-usage stays strict as before.
  assert.throws(() => parseOakOutput([{ type: "data-usage", data: { requestId, state: "settled", actualMicroUsd: 1, heldMicroUsd: 0, promptBytes: 1 } }], requestId), /invalid-output/);
});

// The composer, loaded with element stubs (as in D07) so the closed card's content can be read.
const element = (type, props, key) => ({ type, props: props ?? {}, key });
const workspace = { OAK_DRAFT_LIMIT: 4000, isOakDraftReady: state => state.draft.trim().length > 0, openOakSurface() {}, setOakDraft() {},
  stopOakTurn() {}, submitOakTurn() {}, removeOakQuote() {} };
const requires = {
  // PR 1d: the composer keeps local UI state and effects; one static render needs neither to run.
  react: { useRef: current => ({ current }), useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    useState: initial => [typeof initial === "function" ? initial() : initial, () => {}], useEffect: () => {} },
  "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
  "motion/react": { AnimatePresence: "animate-presence" },
  "@/components/ui/button": { Button: "button" },
  "@/components/ui/rolling-number": { RollingNumber: "rolling-number" },
  "@/components/ui/Icon": { Icon: "svg" },
  "@/components/ui/textarea": { Textarea: "textarea" },
  "@/components/ui/kbd": { Kbd: "kbd" },
  "@/components/ui/meter": { MeterRing: "meter-ring", MeterBar: "meter-bar" },
  "@/components/ui/popover": { Popover: "popover", PopoverTrigger: "popover-trigger", PopoverContent: "popover-content", PopoverTitle: "popover-title" },
  "@/components/ui/tooltip": { Tooltip: "tooltip", TooltipTrigger: "tooltip-trigger", TooltipContent: "tooltip-content" },
  "@/lib/oakDocumentsWorkspace": { getOakDocumentsController: () => ({ clearUse() {} }), oakDocumentName: () => "Your document" },
  "@/lib/oakWorkspace": workspace,
  "@/lib/oakMeaningIcons": loadTsx("src/lib/oakMeaningIcons.ts"),
  "@/lib/oakAllowance": loadTsx("src/lib/oakAllowance.ts"),
  "@/lib/oakFundingSession": loadTsx("src/lib/oakFundingSession.ts"),
  "@/lib/oakTurnstile": loadTsx("src/lib/oakTurnstile.ts"),
  "./OakTurnstile": { OakTurnstile: "oak-turnstile" },
  "./OakTaskMenu": { OakTaskMenu: "task-menu" },
  "./OakQuoteChip": { OakQuoteChip: "quote-chip" },
  "./OakFundingControl": { OakOpenRouterMark: "openrouter-mark", oakAskSteveForMore() {}, oakOpenGrantCode() {}, oakUseOpenRouter() {} },
  // PR 1d: the composer's file intake, counter, paste offer and inline dictation, none of which the meter tests open.
  "@/lib/oakAccountClient": { getOakAccountContext: () => ({ epoch: 0 }) },
  "@/lib/oakChatFlags": { oakEditEarlierOn: () => false },
  "@/lib/oakComposerInput": { oakCounterShown: (length, limit) => length >= Math.ceil(limit * 0.8), oakLooksLikeJobPost: () => false,
    oakSplitDocumentFiles: files => ({ files, skipped: 0 }), oakTransferFiles: () => [], oakTransferHasFiles: () => false },
  "@/lib/oakVoiceCapture": { checkingVoiceConfiguration: { checking: true }, disabledVoiceConfiguration: { enabled: false }, voiceServiceAvailable: () => false },
  "@/lib/oakVoiceWorkspace": { cancelOakVoice() {}, configureOakVoice() {}, getOakVoiceController: () => ({}), readOakVoiceConfiguration: async () => ({ enabled: false }) },
  "./OakVoiceCapture": { OakVoiceCapture: "oak-voice-capture" },
};
const exports = strictLoader(import.meta.url)("src/components/agent/OakComposer.tsx", requires);
const { OakComposer, oakContextMeter, oakComposerMeter } = exports;

const flat = tree => {
  const nodes = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    nodes.push(node);
    visit(node.props.children);
  };
  visit(tree);
  return nodes;
};
const text = node => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text(node.props.children);
};
const answer = (over = {}) => ({ id: requestId, role: "assistant", text: "Steve built it.", answer: null, cards: [], usage: null, state: "complete", page: "/", ...over });
const question = { id: `${requestId}:user`, role: "user", text: "What has Steve built?", answer: null, cards: [], usage: null, state: "complete", page: "/" };
const state = messages => ({ draft: "", quotes: [], draftKind: "question", roleDraft: null, pending: false, messages,
  historyLifecycle: { phase: "idle" }, historyPending: false, authPending: false, authReauthenticate: false, authStatus: null,
  sourceIds: [] }); // PR 1d: the composer reads the page's source ids
const render = (messages, context = { used: 2, limit: 12 }) => flat(OakComposer({ state: state(messages), documents: { documents: [], usedSelections: [], expiresAt: null },
  composerId: "composer", composerRef: { current: null }, intake: false, toolsOpen: false, onToolsOpenChange() {}, onSelectTool() {}, onEscape() {}, context }));

// R11 (intentional update, Oak review v8): the two meters merged into one conversation-memory card. It shows whichever
// limit is fuller (messages kept or text budget), names both totals and states the model's own 1M-token window.
const trigger = nodes => nodes.find(node => node.type === "popover-trigger" && node.props.render?.props.className === "oak-composer__meter");
const cardLines = nodes => flat(nodes.find(node => node.type === "popover-content")).filter(node => node.type === "p" || node.type === "popover-title").map(text);

test("R11 one memory meter shows the fuller limit, with both totals in its name and card", () => {
  const nodes = render([question, answer({ context: reading })]);
  const button = trigger(nodes).props.render.props;
  assert.equal(button["aria-label"], "Conversation memory: 41% full, 2 of 12 messages kept, about 1,556 of 3,840 tokens of text");
  assert.equal(button["data-tone"], "normal", "under 75% is the quiet tone");
  assert.equal(button["data-lead"], "memory", "with no allowance the one ring reads memory");
  assert.equal(text(trigger(nodes).props.children), "41%");
  const card = nodes.find(node => node.type === "popover-content");
  assert.equal(card.props.className, "oak-usage-card");
  assert.equal(flat(card).filter(node => node.type === "section" && node.props["data-context"] === "").length, 1, "one memory section");
  const lines = cardLines(nodes);
  // R17: the card's own title (screen readers) names it, then the memory section's visible title.
  assert.deepEqual(lines.slice(0, 5), ["Conversation memory", "Conversation memory", "41%full", "2 of 12 messages kept", "About 1,556 of 3,840 tokens of text"]);
  assert.match(lines[5], /^The model can read far more\. Oak sends at most about 3,840 per answer/);
  assert.ok(flat(card).some(node => node.type === "meter-bar" && node.props.value === 41 && node.props.max === 100));
  assert.equal(nodes.some(node => node.type === "tooltip-trigger" && /oak-composer__(context|allowance)/.test(node.props.render?.props.className ?? "")), false, "no second meter");
});

test("R17 either limit can fill the meter; 90% or more is out; the text percent is clamped", () => {
  const messagesFull = trigger(render([question, answer({ context: reading })], { used: 12, limit: 12 })).props.render.props;
  assert.equal(messagesFull["data-tone"], "out");
  assert.match(messagesFull["aria-label"], /^Conversation memory: 100% full, 12 of 12 messages kept.* Conversation memory is full\.$/, "out is said in words");
  assert.equal(trigger(render([question, answer({ context: { ...reading, conversationBytes: 14_000 } })])).props.render.props["data-tone"], "out");
  assert.equal(oakContextMeter([answer({ context: { ...reading, conversationBytes: 99_999 } })]).percent, 100);
});

test("R11 before any text reading, the same card shows the messages kept", () => {
  for (const messages of [[question, answer()], [question, answer({ context: reading }), question, answer({ id: "b", context: null, state: "pending" }), answer({ id: "c" })]]) {
    const nodes = render(messages);
    assert.equal(trigger(nodes).props.render.props["aria-label"], "Conversation memory: 17% full, 2 of 12 messages kept");
    assert.equal(cardLines(nodes).some(line => /tokens of text/.test(line)), false);
  }
  // The newest completed answer decides: a pending turn after a reading keeps that reading.
  assert.equal(oakContextMeter([answer({ context: reading }), answer({ id: "b", state: "pending" })]).percent, 41);
});

// R17 (Oak, steveoak.com: "merge the meter circles into one and show states"): one ring, three tones, the worse reading leads.
test("R17 one composer meter: answers lead unless memory is worse; low at a quarter or 75%, out at none or 90%", () => {
  const a = (remaining, limit = 12) => ({ remaining, limit });
  assert.equal(oakComposerMeter(null, null), null, "nothing to read, no meter");
  assert.deepEqual(oakComposerMeter(a(11), 8), { lead: "answers", tone: "normal", answers: "normal", memory: "normal", value: 11, of: 12 });
  assert.equal(oakComposerMeter(a(3), 8).tone, "low", "3 of 12 is a quarter");
  assert.equal(oakComposerMeter(a(4), 8).tone, "normal");
  assert.equal(oakComposerMeter(a(1, 3), null).tone, "low", "a small allowance is low at its last answer");
  assert.deepEqual(oakComposerMeter(a(0), 95), { lead: "answers", tone: "out", answers: "out", memory: "out", value: 0, of: 12 }, "a tie keeps answers");
  assert.deepEqual(oakComposerMeter(a(11), 80), { lead: "memory", tone: "low", answers: "normal", memory: "low", value: 80, of: 100 }, "fuller memory takes the ring, drawn as full like its number");
  assert.equal(oakComposerMeter(a(3), 92).lead, "memory", "out beats low");
  assert.equal(oakComposerMeter(null, 41).lead, "memory", "the visitor's own account: memory only");
});
