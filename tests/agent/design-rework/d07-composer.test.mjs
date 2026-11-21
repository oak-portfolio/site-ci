import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTsx, strictLoader } from "./load-tsx.mjs";

const suggestions = loadTsx("src/lib/oakSuggestions.ts");
const element = (type, props, key) => ({ type, props: props ?? {}, key });
const calls = [];
let askSends = true;
const workspace = {
  OAK_DRAFT_LIMIT: 4000,
  askOakSuggestion: text => { calls.push(["ask", text]); return askSends; },
  isOakDraftReady: state => state.draft.trim().length > 0,
  openOakSurface: surface => calls.push(["open", surface]),
  setOakDraft: text => calls.push(["draft", text]),
  useOakWorkspace: () => ({ authStatus: null }), // Q08 (intentional update): the empty state reads the account purpose.
  stopOakTurn: () => calls.push(["stop"]),
  submitOakTurn: () => calls.push(["submit"]),
  // PR 1d (intentional update): the composer reads the workspace for the dictation draft and the page chip's switch.
  getOakWorkspace: () => ({ draft: "", conversationId: null }),
  setOakPageContext: on => calls.push(["page", on]),
};
const TaskMenu = Object.assign(() => null, { displayName: "OakTaskMenu" });
const Textarea = Object.assign(() => null, { displayName: "Textarea" });
const requires = {
  // PR 1d (intentional update): the composer keeps small local state (page title, offer, dictation, drop) and effects.
  react: { useRef: current => ({ current }), useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useState: initial => [initial, () => {}], useEffect: () => {} },
  "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
  "@/components/ui/button": { Button: "button" },
  "@/components/ui/Icon": { Icon: "svg" },
  "@/components/ui/textarea": { Textarea },
  "@/components/ui/suggestion": { Suggestion: "suggestion", Suggestions: "suggestions" },
  "@/components/ui/kbd": { Kbd: "kbd" },
  "@/components/ui/meter": { MeterRing: "meter", MeterBar: "meter-bar" },
  "@/components/ui/preview-card": { PreviewCard: "preview-card", PreviewCardTrigger: "preview-card-trigger", PreviewCardContent: "preview-card-content" },
  // Q11 (intentional update): the answers-left ring opens a Popover with three actions.
  "@/components/ui/popover": { Popover: "popover", PopoverTrigger: "popover-trigger", PopoverContent: "popover-content", PopoverTitle: "popover-title", PopoverDescription: "popover-description" },
  "@/components/ui/rolling-number": { RollingNumber: "rolling-number" },
  // D123 (intentional update): the composer stages quote chips in an AnimatePresence row.
  "motion/react": { motion: { div: "motion-div" }, AnimatePresence: "animate-presence", useReducedMotion: () => false },
  "./OakQuoteChip": { OakQuoteChip: "quote-chip" },
  // P03-G1: the guest Turnstile widget; these states carry no site key, so it never renders.
  "./OakTurnstile": { OakTurnstile: "oak-turnstile" },
  // Q18 F4 (intentional update): the attachment row clears its sections through the documents controller.
  "@/lib/oakDocumentsWorkspace": { getOakDocumentsController: () => ({ clearUse() {} }), oakDocumentName: (snapshot, id) => snapshot.names?.[id] ?? "Your document" },
  "@/components/ui/tooltip": { Tooltip: "tooltip", TooltipTrigger: "tooltip-trigger", TooltipContent: "tooltip-content" },
  "@/lib/oakSuggestions": suggestions,
  "@/lib/oakWorkspace": workspace,
  // PR 1d (intentional update): paste and drop of files, the counter, the paste offer and inline dictation.
  "@/lib/oakAccountClient": { getOakAccountContext: () => ({ epoch: 0 }) },
  "@/lib/oakComposerInput": { oakCounterShown: (length, limit) => length >= limit * 0.8, oakLooksLikeJobPost: () => false, oakSplitDocumentFiles: files => ({ files, skipped: 0 }), oakTransferFiles: () => [], oakTransferHasFiles: () => false },
  "@/lib/oakVoiceCapture": { checkingVoiceConfiguration: { enabled: false, status: null, checking: true }, disabledVoiceConfiguration: { enabled: false, status: null }, voiceServiceAvailable: () => false },
  "@/lib/oakVoiceWorkspace": { cancelOakVoice() {}, configureOakVoice() {}, getOakVoiceController: () => ({}), readOakVoiceConfiguration: async () => ({ enabled: false, status: null }) },
  "./OakVoiceCapture": { OakVoiceCapture: "voice-capture" },
  "./OakFundingControl": { OakModelReadingDisclosure: "disclosure", OakOpenRouterMark: "openrouter-mark" }, // Q11 (intentional update)
  "./OakTaskMenu": { OakTaskMenu: TaskMenu },
  "./OakActivitySprite": { OakActivitySprite: "sprite" },
  // D126 (intentional update): the empty state carries the one-time welcome tip.
  "./OakTip": { OakTip: "tip" },
  "./OakPausedBanner": { OakPausedBanner: "paused-banner" },
  // R12 (intentional update): a guest sees a dismissible sign-in nudge with a placeholder avatar; signed in, their photo.
  // R13 (intentional update): the empty state reads one account view (ARCH@25); a guest gets no nudge.
  "./OakAccountAvatar": { useOakAccount: () => ({ state: "guest", account: false, ready: false, firstName: null }) },
  "@/components/ui/button": { Button: "button" },
};
const load = file => strictLoader(import.meta.url, { missing: "real" })(file, requires);
const { OakComposer } = load("src/components/agent/OakComposer.tsx");
const { OakEmptyState } = load("src/components/agent/OakEmptyState.tsx");
// v3 review (intentional update): follow-ups are the Related rows under the newest answer, not chips over the composer.
const { OakRelated } = load("src/components/agent/OakRelated.tsx");

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
const baseState = (over = {}) => ({ draft: "What has Steve built?", quotes: [], sourceIds: [], draftKind: "question", roleDraft: null, pending: false, messages: [],
  historyLifecycle: { phase: "idle" }, historyPending: false, authPending: false, authReauthenticate: false, authStatus: null, ...over });
const noDocuments = { documents: [], usedSelections: [], expiresAt: null };
const render = (state, documents = noDocuments) => flat(OakComposer({ state, documents, composerId: "composer", composerRef: { current: { focus() { calls.push(["focus"]); } } },
  intake: false, toolsOpen: false, onToolsOpenChange() {}, onSelectTool() {}, onEscape() {} }));
const byLabel = (nodes, label) => nodes.find(node => node.props["aria-label"] === label);
const input = nodes => nodes.find(node => node.props.id === "oak-composer-input");

test("D07-G1 the composer is one form with a ui/textarea, attach, tools, voice and Send", () => {
  calls.length = 0;
  const nodes = render(baseState());
  assert.equal(nodes.filter(node => node.type === "form").length, 1, "one prompt bar");
  const form = nodes.find(node => node.type === "form");
  assert.equal(form.props.id, "composer", "role and question fields keep form={composerId}");
  const field = input(nodes);
  assert.equal(field.type, Textarea, "the input is ui/textarea");
  assert.equal(field.props["aria-label"], "Message Oak AI Agent");
  // Ticket 23 (SH15, intentional update): no maxLength, so a long paste is never cut silently; the counter and Send hold the limit.
  assert.equal(field.props.maxLength, undefined);
  assert.equal(field.props.enterKeyHint, "send");
  assert.equal(field.props.placeholder, "Ask about Steve's work");
  assert.equal(input(render(baseState({ draftKind: "advice" }))).props.placeholder, "What decision would you like advice on?");
  byLabel(nodes, "Attach documents").props.onClick();
  // PR 1d (intentional update): Dictate opens the strip inside the box instead of the Dictate panel.
  byLabel(nodes, "Dictate a message").props.onClick();
  assert.deepEqual(calls, [["open", "documents"]]);
  assert.equal(nodes.filter(node => node.type === TaskMenu).length, 1, "tools menu sits in the bar");
  const send = nodes.find(node => node.key === "send-turn");
  assert.equal(send.props.type, "submit");
  assert.equal(send.props.disabled, false);
  assert.equal(byLabel(render(baseState({ roleDraft: { roleDescription: "x", intent: "y" } })), "Compare").props.type, "submit", "role drafts submit as Compare");
  assert.equal(render(baseState({ draft: "" })).find(node => node.key === "send-turn").props.disabled, true, "empty draft cannot send");
  assert.equal(render(baseState({ historyPending: true })).find(node => node.key === "send-turn").props.disabled, true);
  assert.ok(render(baseState({ historyPending: true })).some(node => node.props.className === "oak-composer__note"), "history-pending note");
  // v3 review (intentional update): one chip per document, named by its file and how many parts it brings.
  const chips = render(baseState(), { expiresAt: null, names: { d1: "job-post.docx" }, documents: [{ documentId: "d1", sections: [{ id: "s1" }, { id: "s2" }] }],
    usedSelections: [{ documentId: "d1", sectionId: "s1", start: 0, end: 2 }, { documentId: "d1", sectionId: "s2", start: 0, end: 4 }] });
  const chip = chips.find(node => node.props.className === "oak-composer__attachments");
  assert.ok(flat(chip).some(node => node.props.children === "job-post.docx · 2 parts"), "selected parts show as one chip named by the file");
  assert.equal(flat(chip).some(node => /block/i.test(String(node.props.children))), false, "no block numbers");
});

test("D07-G2 Enter sends, Shift+Enter adds a line, IME composition never sends", () => {
  const press = (over, state = baseState()) => {
    let prevented = false, submitted = 0;
    input(render(state)).props.onKeyDown({ key: "Enter", shiftKey: false, nativeEvent: { isComposing: false, keyCode: 13 },
      preventDefault() { prevented = true; }, currentTarget: { form: { requestSubmit() { submitted++; } } }, ...over });
    return { prevented, submitted };
  };
  assert.deepEqual(press({}), { prevented: true, submitted: 1 }, "Enter sends");
  assert.deepEqual(press({ shiftKey: true }), { prevented: false, submitted: 0 }, "Shift+Enter keeps the newline");
  assert.deepEqual(press({ nativeEvent: { isComposing: true, keyCode: 13 } }), { prevented: false, submitted: 0 }, "composition never sends");
  assert.deepEqual(press({ nativeEvent: { isComposing: false, keyCode: 229 } }), { prevented: false, submitted: 0 }, "Safari IME keyCode never sends");
  assert.deepEqual(press({}, baseState({ draft: "" })), { prevented: true, submitted: 0 }, "an empty draft swallows Enter");
  assert.deepEqual(press({}, baseState({ pending: true })), { prevented: true, submitted: 0 }, "Enter during a turn does not queue another");
  assert.deepEqual(press({ key: "a" }), { prevented: false, submitted: 0 });
});

test("D07-G3 Send becomes a keyboard-reachable Stop during a turn", () => {
  calls.length = 0;
  const nodes = render(baseState({ pending: true }));
  assert.equal(nodes.some(node => node.key === "send-turn"), false);
  const stop = nodes.find(node => node.key === "stop-turn");
  assert.equal(stop.type, "button");
  assert.equal(stop.props.type, "button", "Stop never submits the form");
  assert.equal(stop.props.disabled, undefined, "Stop stays focusable");
  assert.equal(stop.props.tabIndex, undefined, "Stop stays in the tab order");
  assert.equal(stop.props["aria-label"], "Stop");
  const order = [];
  workspace.stopOakTurn = () => order.push("stop");
  stop.props.onClick({ preventDefault() { order.push("prevent"); } });
  assert.deepEqual(order, ["prevent", "stop"], "default is prevented before cancelling");
  const form = nodes.find(node => node.type === "form");
  form.props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls, [], "submitting during a turn does nothing");
  assert.equal(nodes.some(node => node.type === TaskMenu), false, "tools hide during a turn");
});

test("D07-G4 empty-state and follow-up chips come from page and answer data with no model call", () => {
  const savedFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("no model call"); };
  try {
    calls.length = 0;
    const labels = { knowledgeRevision: "r", documents: [{ documentId: "w", title: "HyperSkalers", canonicalUrl: "https://steveoak.com/work/hyperskalers" }] };
    const home = suggestions.oakPageSuggestions("/");
    const work = suggestions.oakPageSuggestions("/work/hyperskalers", labels);
    assert.ok(home.length >= 3 && home.length <= 5 && work.length >= 3 && work.length <= 5, "3 to 5 starters");
    assert.equal(work[0], "What did Steve own on HyperSkalers?", "a Work page names its project");
    const slashed = { knowledgeRevision: "r", documents: [{ documentId: "w", title: "EcoSmartLoop: AI Agent Platform", canonicalUrl: "https://steveoak.com/work/ecosmartloop/" }] };
    assert.equal(suggestions.oakPageSuggestions("/work/ecosmartloop", slashed)[0], "What did Steve own on EcoSmartLoop?", "a canonical URL's trailing slash still matches the route");
    const empty = flat(OakEmptyState({ route: "/work/hyperskalers", citationLabels: labels, onStarter: text => calls.push(["starter", text]) }));
    const starters = empty.filter(node => node.type === "suggestion");
    assert.deepEqual(starters.map(node => node.props.suggestion), work);
    starters[0].props.onSelect(starters[0].props.suggestion);
    assert.deepEqual(calls, [["starter", work[0]]]);

    const complete = { role: "assistant", state: "complete", answer: { kind: "sourced", claims: [], acknowledgment: null },
      cards: [{ kind: "contact", label: "Say Hi", url: "/contact" }, { kind: "navigate", label: "HyperSkalers", url: "https://steveoak.com/work/hyperskalers" }] };
    const follow = suggestions.oakAnswerSuggestions(complete);
    assert.ok(follow.length >= 2 && follow.length <= 3, "2 to 3 follow-ups");
    assert.equal(follow[0], "What did Steve own on HyperSkalers?", "a navigate card's label names the project");
    assert.deepEqual(suggestions.oakAnswerSuggestions({ ...complete, state: "streaming" }), [], "no chips before the answer completes");
    assert.deepEqual(suggestions.oakAnswerSuggestions({ ...complete, answer: { kind: "declined", acknowledgment: "ok" } }), []);
    const long = { ...complete, cards: [{ kind: "navigate", label: "EcoSmartLoop: AI Agent Platform for a $640B Waste Problem", url: "https://steveoak.com/work/ecosmartloop" }] };
    assert.equal(suggestions.oakAnswerSuggestions(long)[0], "What did Steve own on EcoSmartLoop?", "a long page title shortens to the project name");
    assert.equal(suggestions.oakAnswerSuggestions(long, "What did Steve own on the EcoSmartLoop classifier?")[0], "What would Steve change on EcoSmartLoop next time?",
      "a follow-up never repeats the question just asked");
    assert.equal(suggestions.oakShortTitle("LinkedIn Growth Loop: High-Autonomy Agent Teams"), "LinkedIn Growth Loop");
    assert.equal(suggestions.oakShortTitle("Steve Oak / Okkar Kyaw"), "Steve Oak / Okkar Kyaw");

    calls.length = 0;
    assert.equal(render(baseState({ messages: [complete] })).some(node => node.type === "suggestion"), false, "the composer carries no follow-ups");
    assert.deepEqual(suggestions.oakComposerSuggestions(baseState({ messages: [complete] }), false), follow, "the newest answer's follow-ups come from its data");
    const element = document => document;
    const document = { getElementById: () => ({ focus() { calls.push(["focus"]); } }) };
    globalThis.document = document;
    const chips = flat(OakRelated({ questions: follow })).filter(node => node.type === "suggestion");
    assert.deepEqual(chips.map(node => node.props.suggestion), follow, "follow-ups are the Related rows under the answer");
    void element;
    chips[1].props.onSelect(chips[1].props.suggestion);
    assert.deepEqual(calls, [["ask", follow[1]]], "a follow-up chip asks straight away");
    calls.length = 0; askSends = false;
    chips[0].props.onSelect(chips[0].props.suggestion);
    assert.deepEqual(calls, [["ask", follow[0]], ["focus"]], "when a turn cannot start, the chip fills the box and focuses it");
    askSends = true;
    delete globalThis.document;
    assert.deepEqual(suggestions.oakComposerSuggestions(baseState({ messages: [complete], pending: true }), false), [], "no follow-ups while a turn runs");
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test("D19-G4 Escape stops a running answer from the composer; otherwise it reaches the panel handler", () => {
  const order = [], escaped = [];
  workspace.stopOakTurn = () => order.push("stop");
  const formOf = state => flat(OakComposer({ state, documents: noDocuments, composerId: "composer", composerRef: { current: null },
    intake: false, toolsOpen: false, onToolsOpenChange() {}, onSelectTool() {}, onEscape: event => escaped.push(event.key) })).find(node => node.type === "form");
  const key = (name) => ({ key: name, preventDefault() { order.push("prevent"); }, stopPropagation() { order.push("contain"); } });
  formOf(baseState({ pending: true })).props.onKeyDownCapture(key("Escape"));
  assert.deepEqual(order, ["prevent", "contain", "stop"], "the dialog never sees this Escape, so the workspace stays open");
  assert.deepEqual(escaped, []);
  order.length = 0;
  formOf(baseState()).props.onKeyDownCapture(key("Escape"));
  assert.deepEqual([order, escaped], [[], ["Escape"]], "with no answer running, Escape keeps its panel behavior");
});
