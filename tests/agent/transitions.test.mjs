import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { regressionSet, briefCases, currentSourceBindings } from './evaluation-cases.v1.ts';
import { createLoader, stubSets } from './design-rework/load-tsx.mjs';

const loadShared = createLoader();
const lifecycle = loadShared('src/lib/oakMascotLifecycle.ts');
const policy = loadShared('packages/oak-agent-contracts/src/policy.ts');
const advice = loadShared('packages/oak-agent-contracts/src/advice.ts');
const research = loadShared('packages/oak-agent-contracts/src/public-research.ts');
const documents = loadShared('packages/oak-agent-contracts/src/documents.ts');
const contracts = loadShared('packages/oak-agent-contracts/src/transport.ts');
const brief = loadShared('src/lib/oakContactBrief.ts');

test('long hidden time freezes typewriter progress and note deadlines, including repeated reversals', () => {
  let wallTime = 100;
  const clock = new lifecycle.MascotReadingClock(() => wallTime);
  clock.resume();
  wallTime += 180;
  const before = clock.now();
  const remaining = 12000 - before;
  clock.pause();
  clock.pause();
  wallTime += 90000;
  assert.equal(clock.now(), before);
  assert.equal(12000 - clock.now(), remaining);
  assert.equal(lifecycle.typewriterVisibleCount(50, clock.now(), 900), 10);
  clock.resume();
  clock.resume();
  wallTime += 180;
  assert.equal(clock.now(), 360);
  assert.equal(lifecycle.typewriterVisibleCount(50, clock.now(), 900), 20);
});

test('typewriter emits whole graphemes for joined emoji and accents', () => {
  const graphemes = lifecycle.getTypewriterGraphemes('A👨‍👩‍👧‍👦e\u0301');
  assert.deepEqual(graphemes, ['A', '👨‍👩‍👧‍👦', 'e\u0301']);
  assert.equal(graphemes.slice(0, lifecycle.typewriterVisibleCount(3, 100, 300)).join(''), 'A');
  assert.equal(graphemes.slice(0, lifecycle.typewriterVisibleCount(3, 200, 300)).join(''), 'A👨‍👩‍👧‍👦');
});

test('cancelled callbacks cannot revive old intent, while the latest owner can run', () => {
  const callbacks = new lifecycle.MascotCallbackOwner();
  const calls = [];
  const obsolete = callbacks.guard(() => calls.push('obsolete'));
  callbacks.own(() => calls.push('cleared'));
  callbacks.cancel();
  const current = callbacks.guard(() => calls.push('current'));
  obsolete();
  current();
  assert.deepEqual(calls, ['cleared', 'current']);
  callbacks.cancel();
  current();
  assert.deepEqual(calls, ['cleared', 'current']);
});

const guestAuthStatus = { configured: false, kind: 'guest', phase: 'guest', role: 'visitor', publishableKey: null, purpose: null,
  allowance: { answers: { limit: 6, remaining: 6, refillsAt: null }, window: { completed: 0, pending: 0, limit: 100, remaining: 100 } } };
function workspaceFixture(auth = {}) {
  let observeOverlay;
  globalThis.MutationObserver = class {
    constructor(callback) { observeOverlay = callback; }
    observe() {}
    disconnect() {}
  };
  const documentTarget = new EventTarget();
  Object.assign(documentTarget, {
    documentElement: { dataset: {} },
    body: { dataset: { oakAgentEligible: 'true', oakMascotEligible: 'true', oakSourceIds: '["home-source"]' } },
    querySelectorAll: () => [],
    querySelector: () => null,
  });
  globalThis.document = documentTarget;
  globalThis.window = Object.assign(new EventTarget(), { location: { pathname: '/' }, innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, visualViewport: Object.assign(new EventTarget(), { height: 900, width: 1440 }) });
  const runs = [];
  const cancels = [];
  let rejectCancel;
  const accountClient = {
    getOakAccountContext: auth.context ?? (() => ({ epoch: 0, accountVersion: 0, authenticated: false })),
    subscribeOakAccountContext: auth.subscribe ?? (() => () => {}),
    readOakAuthStatus: auth.readStatus ?? (async () => guestAuthStatus),
    continueOakAccount: auth.continueAccount ?? (async () => { throw new Error('not-configured'); }),
    resumeOakAccount: auth.resume ?? (async () => false),
  };
  const authHandoff = {
    saveOakAuthHandoff: auth.save ?? (() => true), readOakAuthHandoff: auth.read ?? (() => null),
    clearOakAuthHandoff: auth.clear ?? (() => {}), clearOakConversationHandoff: () => {},
  };
  // Document preparation is outside these existing transition assertions. Keep its inactive boundary explicit.
  const documentController = { snapshot: () => ({ pending: false, usedSelections: [] }), disposeOwned() {}, close() {}, cancel() {}, open() {} };
  const load = createLoader({ use: [stubSets.react, stubSets.workspaceStore({ account: accountClient, handoff: authHandoff,
    transport: {
      streamOakTurn: (turn, signal, callbacks) => new Promise((resolve, reject) => runs.push({ turn, signal, callbacks, resolve, reject })),
      cancelOakTurn: (...ids) => { cancels.push(ids); return new Promise((_, reject) => { rejectCancel = reject; }); },
    } })],
    stubs: {
      '../../packages/oak-agent-contracts/src/output': { renderOakAnswer: () => 'Fixture completed' },
      './oakToasts': { showOakToast: () => {} },
      './oakSignInConfiguration': { readOakSignInConfiguration: auth.signInConfig ?? (async () => ({ kind: 'sign-in-config', configured: false, publishableKey: null })) },
      './oakDocumentsWorkspace': { getOakDocumentTurnContext: () => null, getOakDocumentsController: () => documentController, oakDocumentFailure: () => 'Fixture document failure' },
    } });
  const voiceWorkspace = load('src/lib/oakVoiceWorkspace.ts'), store = load('src/lib/oakWorkspace.ts');
  store.installOakPresentationOwner();
  return { store, runs, cancels, document: documentTarget, window: globalThis.window, voiceWorkspace, observeOverlay: () => observeOverlay(), failCancel: () => rejectCancel?.(new Error('late cancellation failure')) };
}

test('below-minimum entry stays in browsing without account, recording, or model work', async () => {
  let accountReads = 0;
  const { store, window, runs } = workspaceFixture({ readStatus: async () => { accountReads++; return guestAuthStatus; } });
  store.setOakDraft('Retain this exact draft.');
  for (const [width, height] of [[359, 844], [874, 402], [360, 480]]) {
    window.innerWidth = width; window.innerHeight = height;
    window.outerWidth = width; window.outerHeight = height + 80;
    window.dispatchEvent(new Event('resize'));
    assert.equal(store.requestOakWorkspace({}), false);
    assert.equal(store.getOakWorkspace().presentation, 'human-browse');
    assert.equal(store.getOakWorkspace().viewportNotice, true);
    assert.equal(store.getOakWorkspace().draft, 'Retain this exact draft.');
    await store.openOakVoiceInput();
    store.beginOakRoleDraft(); store.beginOakQuestionDraft(); store.beginOakAdviceDraft(); store.openOakContactBrief(); store.openOakDocuments();
    await store.submitOakTurn();
    assert.equal(store.getOakWorkspace().roleDraft, null);
    assert.equal(store.getOakWorkspace().questionDraft, null);
    assert.equal(store.getOakWorkspace().briefOpen, false);
    assert.equal(store.getOakWorkspace().voiceOpen, false);
    assert.equal(store.getOakWorkspace().draftKind, 'question');
    assert.equal(runs.length, 0); assert.equal(accountReads, 0);
  }
  window.innerWidth = 360; window.innerHeight = 600; window.outerWidth = 360; window.outerHeight = 680;
  window.dispatchEvent(new Event('resize'));
  assert.equal(store.getOakWorkspace().viewportNotice, false);
  assert.equal(store.getOakWorkspace().presentation, 'human-browse');
  assert.equal(store.requestOakWorkspace({}), true, 'minimum includes the layout edges');
});

test('real unsupported resize retains the mounted session and Stop; recovery never sends', async () => {
  const { store, window, runs, cancels } = workspaceFixture();
  store.requestOakWorkspace({}); store.setOakDraft('An owned turn');
  const submitted = store.submitOakTurn();
  store.setOakDraft('My exact unsent next draft');
  const before = store.getOakWorkspace();
  window.innerHeight = 599; window.outerHeight = 679; window.dispatchEvent(new Event('resize'));
  assert.equal(store.getOakWorkspace().presentation, 'human-agent');
  assert.equal(store.getOakWorkspace().viewportSupported, false);
  assert.equal(store.getOakWorkspace().viewportNotice, true);
  assert.equal(store.getOakWorkspace().messages, before.messages);
  assert.equal(store.getOakWorkspace().conversationId, before.conversationId);
  assert.equal(store.getOakWorkspace().draft, before.draft);
  assert.equal(store.getOakWorkspace().pending, true);
  store.beginOakRoleDraft(); store.startNewOakConversation(); await store.submitOakTurn();
  assert.equal(store.getOakWorkspace().draft, before.draft); assert.equal(runs.length, 1); assert.equal(cancels.length, 0);
  store.stopOakTurn(); assert.equal(cancels.length, 1);
  const stoppedMessages = store.getOakWorkspace().messages;
  runs[0].resolve(); await submitted;
  window.innerHeight = 720; window.outerHeight = 800; window.dispatchEvent(new Event('resize'));
  assert.equal(store.getOakWorkspace().viewportSupported, true);
  assert.equal(store.getOakWorkspace().viewportNotice, false);
  assert.equal(store.getOakWorkspace().messages, stoppedMessages);
  assert.equal(store.getOakWorkspace().draft, before.draft); assert.equal(runs.length, 1);
});

test('keyboard-only compression keeps supported focused portrait intake and real window resize still blocks', () => {
  const { store, window, document } = workspaceFixture();
  window.innerWidth = 390; window.innerHeight = 844; window.outerWidth = 390; window.outerHeight = 924;
  window.dispatchEvent(new Event('resize')); store.requestOakWorkspace({}); store.beginOakRoleDraft();
  store.setOakRoleDraftInput('roleDescription', 'Retain focused role text');
  const roleDraft = store.getOakWorkspace().roleDraft;
  const originalHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = class { closest() { return null; } matches() { return true; } };
  try {
    const field = new HTMLElement(); document.activeElement = field;
    const focused = new Event('focusin'); Object.defineProperty(focused, 'target', { value: field }); document.dispatchEvent(focused);
    window.dispatchEvent(new Event('resize')); // Some keyboard event sequences begin before layout compression.
    window.visualViewport.height = 320; window.visualViewport.width = 390;
    window.visualViewport.dispatchEvent(new Event('resize'));
    assert.equal(store.getOakWorkspace().viewportSupported, true, 'visual compression alone is not admission');
    window.innerHeight = 320; window.dispatchEvent(new Event('resize'));
    assert.equal(store.getOakWorkspace().viewportSupported, true, 'resize-content keyboard retains pre-focus layout');
    assert.equal(store.getOakWorkspace().roleDraft, roleDraft);
    assert.equal(document.activeElement, field); assert.equal(store.getOakWorkspace().viewportNotice, false);
    window.outerHeight = 400; window.dispatchEvent(new Event('resize'));
    assert.equal(store.getOakWorkspace().viewportSupported, false, 'real height resize retires the keyboard baseline');
    assert.equal(store.getOakWorkspace().roleDraft, roleDraft);
    window.innerHeight = 844; window.outerHeight = 924; window.dispatchEvent(new Event('resize'));
    assert.equal(store.getOakWorkspace().viewportSupported, true);
    assert.equal(store.getOakWorkspace().roleDraft, roleDraft);
  } finally { globalThis.HTMLElement = originalHTMLElement; }
});

const publicRef = (slug, suffix) => ({ documentId: `work:${slug}`, passageId: `${slug}:passage-${suffix}`, sectionId: `${slug}:section`, url: `https://steveoak.com/work/${slug}/#${suffix}` });

test('guest allowance prompts explicit sign-in and purpose without sending or clearing the draft', async () => {
  let status = { ...guestAuthStatus, configured: true, publishableKey: 'pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk', phase: 'sign-in-required',
    allowance: { answers: { limit: 6, remaining: 0, refillsAt: null }, window: { completed: 6, pending: 0, limit: 100, remaining: 94 } } };
  const saved = [], continued = [];
  const { store, runs } = workspaceFixture({ readStatus: async () => status, save: value => { saved.push(value.draft); return true; },
    continueAccount: async input => { continued.push(input); return { ...status, phase: 'ready', purpose: input.purpose }; } });
  store.requestOakWorkspace({});
  store.setOakDraft('Keep this unsent question through sign-in.');
  await store.refreshOakAuthStatus();
  await store.submitOakTurn();
  assert.equal(runs.length, 0);
  assert.equal(store.getOakWorkspace().draft, 'Keep this unsent question through sign-in.');
  store.beginOakSignIn();
  assert.equal(store.getOakWorkspace().authOpen, true);
  assert(saved.includes('Keep this unsent question through sign-in.'));
  status = { ...status, kind: 'account', phase: 'continue-required' };
  await store.refreshOakAuthStatus();
  await store.completeOakAccount({ purpose: 'recruiting' });
  assert.deepEqual(continued, [{ purpose: 'recruiting' }]);
  assert.equal(store.getOakWorkspace().authStatus.phase, 'ready');
  assert.equal(store.getOakWorkspace().authOpen, false);
  assert.equal(store.getOakWorkspace().draft, 'Keep this unsent question through sign-in.');
  assert.equal(runs.length, 0, 'continuation never automatically sends the retained draft');
  const run = store.submitOakTurn();
  // The fixture's account SDK never reports a live session, so the send first renews it (one tick).
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(runs.length, 1, 'the visitor can submit explicitly after continuation');
  store.stopOakTurn();
  runs[0].reject(new DOMException('Stopped', 'AbortError'));
  await run;
});

test('a late account continuation cannot reopen or overwrite a new conversation', async () => {
  let finish;
  const status = { ...guestAuthStatus, configured: true, kind: 'account', phase: 'continue-required' };
  let cleared = 0;
  const { store, runs } = workspaceFixture({ readStatus: async () => status, clear: () => cleared++,
    continueAccount: () => new Promise(resolve => { finish = resolve; }) });
  store.requestOakWorkspace({});
  await store.refreshOakAuthStatus();
  store.setOakDraft('Prior unsent draft.');
  store.beginOakSignIn();
  const continuation = store.completeOakAccount({ purpose: 'exploring' });
  assert.equal(store.getOakWorkspace().authPending, true);
  store.startNewOakConversation();
  store.setOakDraft('New conversation draft.');
  finish({ ...status, phase: 'ready', purpose: 'exploring' });
  await continuation;
  assert.equal(store.getOakWorkspace().draft, 'New conversation draft.');
  assert.equal(store.getOakWorkspace().authPending, false);
  assert.equal(store.getOakWorkspace().authOpen, false);
  assert.equal(store.getOakWorkspace().authStatus.phase, 'continue-required');
  assert.equal(runs.length, 0);
  assert(cleared > 0);
});

const accountKey = 'pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk';
const readyAccount = { ...guestAuthStatus, configured: true, kind: 'account', phase: 'ready', purpose: 'exploring', publishableKey: accountKey,
  allowance: { answers: { limit: 6, remaining: 5, refillsAt: null }, window: { completed: 1, pending: 0, limit: 100, remaining: 99 } } };

test('D66 a reload with a stale session cookie renews through the account SDK instead of ending the session', async () => {
  let renewed = false, resumed = 0;
  const { store } = workspaceFixture({
    // Until the account SDK renews it, the stale session cookie is refused; afterwards the status succeeds.
    readStatus: async () => { if (!renewed) throw new Error('sign-in-required'); return readyAccount; },
    signInConfig: async () => ({ kind: 'sign-in-config', configured: true, publishableKey: accountKey }),
    resume: async key => { resumed++; assert.equal(key, accountKey); renewed = true; return true; },
  });
  store.requestOakWorkspace({});
  await store.refreshOakAuthStatus();
  assert.ok(resumed >= 1, 'the account SDK renewed the session');
  assert.equal(store.getOakWorkspace().authReauthenticate, false, 'a live session never reads as ended');
  assert.equal(store.getOakWorkspace().authStatus.phase, 'ready');
});

test('D66 a session that cannot renew still asks to sign in again', async () => {
  const { store } = workspaceFixture({
    readStatus: async () => { throw new Error('sign-in-required'); },
    signInConfig: async () => ({ kind: 'sign-in-config', configured: true, publishableKey: accountKey }),
    resume: async () => { throw new Error('sign-in-required'); },
  });
  store.requestOakWorkspace({});
  await store.refreshOakAuthStatus();
  assert.equal(store.getOakWorkspace().authReauthenticate, true);
});

// P15 sign-off pass (2026-10-17): a reloaded signed-in tab sent its first question on a stale cookie and failed as "Sign in again".
test('P15 a reloaded account tab renews its session before sending the first question; a guest sends at once', async () => {
  // Renewing loads the account SDK, which changes the account context; the workspace stops any turn in flight on that
  // change, so the renewal must finish before the turn exists.
  let resumed = 0, context = { epoch: 0, accountVersion: 0, authenticated: false };
  const listeners = new Set();
  const { store, runs } = workspaceFixture({ readStatus: async () => readyAccount, context: () => context,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    resume: async () => { resumed++; context = { epoch: 1, accountVersion: 1, authenticated: true }; for (const listener of listeners) listener(); return true; } });
  store.requestOakWorkspace({});
  await store.refreshOakAuthStatus();
  assert.equal(resumed, 0, 'opening the workspace loads nothing');
  store.setOakDraft('What has Steve built?');
  const run = store.submitOakTurn();
  assert.equal(runs.length, 0, 'nothing is sent before the session renews');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(resumed, 1);
  assert.equal(runs.length, 1, 'the question is sent after renewal');
  assert.equal(store.getOakWorkspace().pending, true, 'and is still running, not stopped by the account change');
  store.stopOakTurn();
  runs[0].reject(new DOMException('Stopped', 'AbortError'));
  await run;
  const guest = workspaceFixture({ resume: async () => { throw new Error('a guest never loads the account SDK'); } });
  guest.store.requestOakWorkspace({});
  await guest.store.refreshOakAuthStatus();
  guest.store.setOakDraft('What has Steve built?');
  const guestRun = guest.store.submitOakTurn();
  assert.equal(guest.runs.length, 1);
  guest.store.stopOakTurn();
  guest.runs[0].reject(new DOMException('Stopped', 'AbortError'));
  await guestRun;
});

test('failed auth preservation leaves the current draft untouched and does not start sign-in', async () => {
  const { store, runs } = workspaceFixture({ readStatus: async () => ({ ...guestAuthStatus, configured: true, phase: 'sign-in-required' }), save: () => false });
  store.requestOakWorkspace({});
  store.setOakDraft('This browser refuses session storage.');
  await store.refreshOakAuthStatus();
  store.beginOakSignIn();
  assert.equal(store.getOakWorkspace().authOpen, false);
  assert.equal(store.getOakWorkspace().draft, 'This browser refuses session storage.');
  assert.match(store.getOakWorkspace().authError, /could not retain/);
  assert.equal(runs.length, 0);
});
const publicAnswer = refs => ({ schema: 'oak.answer.v1', speaker: 'oak-ai-host', characterVersion: 'fixture', hardPolicyVersion: 'fixture', knowledgeRevision: 'fixture', operations: ['read'],
  kind: 'sourced', acknowledgment: null, claims: refs.map((citation, index) => ({ id: `claim-${index}`, text: `Unselected historical detail ${index}`, citations: [citation] })) });

test('brief starts from the visitor\'s own words only, selects exact approved output references explicitly and never copies Oak\'s answer into fields', async () => {
  const example = briefCases.explicitSelection;
  const snapshot = JSON.parse(readFileSync(new URL('../../src/data/generated/knowledgeSnapshot.json', import.meta.url), 'utf8'));
  assert.equal(snapshot.revision, regressionSet.sourceRevision);
  for (const reference of example.references) {
    const binding = currentSourceBindings[reference.passageId];
    const document = snapshot.documents.find(value => value.id === reference.documentId);
    const passage = document.passages.find(value => value.id === reference.passageId);
    assert.deepEqual(reference, { documentId: document.id, passageId: passage.id, sectionId: passage.sectionId, url: passage.citationUrl });
    assert.deepEqual({ text: binding.text, canonicalUrl: binding.canonicalUrl, attribution: binding.attribution, dates: binding.dates },
      { text: passage.text, canonicalUrl: document.canonicalUrl, attribution: document.attribution, dates: document.dates });
  }
  const { store, runs } = workspaceFixture();
  store.requestOakWorkspace({});
  store.beginOakRoleDraft();
  store.setOakRoleDraftInput('roleDescription', example.roleDescription);
  store.setOakRoleDraftInput('intent', example.intent);
  const submitted = store.submitOakTurn();
  const refs = example.references;
  runs[0].callbacks.output({ answer: { ...publicAnswer(refs), knowledgeRevision: regressionSet.sourceRevision }, cards: [], usage: null });
  runs[0].resolve(); await submitted;
  store.openOakContactBrief();
  // Q06 (intentional update): GOAL-V6 asks that the visitor's words carry into the brief, so goals open with their latest
  // words in this chat (here the comparison request), never Oak's answer text; every other field stays blank.
  assert.deepEqual(store.getOakWorkspace().briefDraft, { ...brief.emptyOakContactBrief(), goals: example.intent, needsFormat: true });
  store.setOakContactBriefInput('goals', '');
  assert.deepEqual(store.getOakBriefReferences(), refs);
  for (const [field, value] of Object.entries(example.fields)) store.setOakContactBriefInput(field, value);
  for (const index of example.selectedReferenceIndexes) store.toggleOakBriefReference(brief.briefReferenceKey(refs[index]));
  const changed = { ...refs[0], url: example.alteredUrl };
  store.toggleOakBriefReference(brief.briefReferenceKey(changed));
  assert.deepEqual(store.getOakWorkspace().briefDraft.references, refs.slice(0, 2), 'altered canonical reference is not in the approved options');
  assert.match(store.getOakWorkspace().briefError, /public references from this list/);
  store.prepareOakContactBrief();
  const draft = store.getOakWorkspace().briefDraft;
  assert.equal(draft.goals, example.fields.goals);
  assert.equal(draft.references.length, 2);
  assert(draft.text.includes(draft.goals));
  // Q16 (intentional update): the brief lists each reference page without its in-page anchor (D8).
  assert(draft.text.includes(refs[0].url.replace(/#.*$/, '')) && draft.text.includes(refs[1].url.replace(/#.*$/, '')));
  for (const absent of [...example.excludedText, refs[2].url]) assert(!draft.text.includes(absent));
  const mailto = new URL(brief.oakBriefMailto(draft));
  assert.equal(mailto.protocol, 'mailto:');
  assert.equal(mailto.pathname, 'okkark.pro@gmail.com');
  assert.equal(mailto.searchParams.get('body'), draft.text);
  assert.deepEqual([...mailto.searchParams.keys()], ['subject', 'body']);
  assert.equal(runs.length, 1, 'brief entry, edits, selection and formatting never dispatch another turn');
});

test('brief edits survive active advice Stop, close/reopen and late output; explicit New clears independently', async () => {
  const { store, runs, cancels } = workspaceFixture();
  store.requestOakWorkspace({});
  store.beginOakAdviceDraft(); store.setOakDraft('I am exploring a collaboration on an interface.');
  const initial = store.submitOakTurn();
  const firstAnswer = { schema: 'oak.answer.v1', speaker: 'oak-ai-host', characterVersion: 'fixture', hardPolicyVersion: 'fixture', knowledgeRevision: 'fixture', operations: ['read'],
    kind: 'advice', scope: 'supported-expertise', proposal: advice.advicePlans['product-interface'], evidence: publicAnswer([publicRef('ecosmartloop', 'app')]).claims,
    uncertainty: advice.adviceCurrentUncertainty, contactOffer: true };
  runs[0].callbacks.output({ answer: firstAnswer, cards: [], usage: null });
  runs[0].resolve(); await initial;
  store.openOakContactBrief();
  store.setOakContactBriefInput('goals', 'Visitor goal');
  store.prepareOakContactBrief();
  const exactText = `${store.getOakWorkspace().briefDraft.text}\n\nMy own final edit.`;
  store.setOakContactBriefText(exactText);
  const before = store.getOakWorkspace().briefDraft;
  store.declineOakContactOffer();
  store.beginOakAdviceDraft();
  store.setOakDraft('Please help me clarify the project interface.');
  assert.equal(runs.length, 1);
  const submitted = store.submitOakTurn();
  assert.deepEqual(runs[1].turn.task, { kind: 'advice', text: 'Please help me clarify the project interface.', contactPreference: 'declined' });
  assert(!JSON.stringify(runs[1].turn).includes('My own final edit'), 'brief is not sent with advice');
  store.stopOakTurn();
  assert.equal(cancels.length, 1);
  assert.equal(runs[1].signal.aborted, true);
  assert.equal(store.getOakWorkspace().draftKind, 'advice');
  assert.deepEqual(store.getOakWorkspace().briefDraft, before);
  runs[1].callbacks.output({ answer: publicAnswer([publicRef('ecosmartloop', 'late')]), cards: [], usage: null });
  runs[1].resolve(); await submitted;
  store.closeOakWorkspace();
  store.requestOakWorkspace({});
  assert.deepEqual(store.getOakWorkspace().briefDraft, before);
  assert.equal(store.getOakWorkspace().contactPreference, 'declined');
  assert.deepEqual(store.getOakWorkspace().messages[1].answer, firstAnswer);
  assert.equal(store.getOakWorkspace().messages[1].state, 'complete');
  assert.equal(store.getOakWorkspace().messages[3].state, 'interrupted');
  store.closeOakContactBrief();
  store.openOakContactBrief();
  assert.equal(store.getOakWorkspace().briefDraft.text, exactText);
  assert.equal(runs.length, 2);
  store.startNewOakConversation();
  assert.equal(store.getOakWorkspace().briefDraft, null);
  assert.equal(store.getOakWorkspace().briefOpen, false);
  assert.equal(store.getOakWorkspace().contactPreference, 'open');
});

test('brief bounds and start-date statements fail without cutting visitor fields; stale reference selection cannot be emailed', () => {
  const { store, runs } = workspaceFixture();
  store.openOakContactBrief();
  const missing = brief.formatOakContactBrief(brief.emptyOakContactBrief());
  for (const question of ['What goals would I like to discuss?', 'What constraints should I share?', 'what proposed start date should we discuss?', 'Which public work references would be useful?']) assert(missing.includes(question));
  store.setOakContactBriefInput('goals', 'x'.repeat(1501));
  store.prepareOakContactBrief();
  assert.equal(store.getOakWorkspace().briefDraft.goals.length, 1501);
  assert.equal(store.getOakWorkspace().briefDraft.text, '');
  assert.match(store.getOakWorkspace().briefError, /Your text has been kept/);
  store.setOakContactBriefInput('goals', 'A visitor goal');
  store.setOakContactBriefInput('startDateQuestion', 'Steve will start next Monday.');
  store.prepareOakContactBrief();
  assert.equal(store.getOakWorkspace().briefDraft.startDateQuestion, 'Steve will start next Monday.');
  assert.match(store.getOakWorkspace().briefError, /question to Steve/);
  store.setOakContactBriefInput('startDateQuestion', 'Would a proposed Monday start work for you?');
  store.prepareOakContactBrief();
  store.setOakContactBriefText('Steve will start next Monday.');
  assert.throws(() => brief.oakBriefMailto(store.getOakWorkspace().briefDraft), /cannot commit/);
  store.prepareOakContactBrief();
  store.setOakContactBriefInput('constraints', 'New explicit constraint');
  assert.throws(() => brief.oakBriefMailto(store.getOakWorkspace().briefDraft), /Update the brief/);
  assert.equal(runs.length, 0);
  for (const url of ['javascript:alert(1)', 'https://unapproved.example/work', 'https://name:password@steveoak.com/work/ecosmartloop', 'https://independent-performance-642823.framer.app/codex/ai-automation-cloud?changed=1']) {
    const unsafe = { ...brief.emptyOakContactBrief(), references: [{ ...publicRef('ecosmartloop', 'app'), url }] };
    assert.throws(() => brief.formatOakContactBrief(unsafe), /approved public references/);
  }
});

test('No Thanks persists on later advice and ordinary questions after bounded history eviction without provider work for local decline', async () => {
  const { store, runs } = workspaceFixture();
  store.requestOakWorkspace({});
  store.declineOakContactOffer();
  assert.equal(runs.length, 0);
  assert.match(store.getOakWorkspace().contactNotice, /leave contact suggestions/);
  for (let index = 0; index < 7; index++) {
    store.setOakDraft(`Factual question ${index}`);
    const submitted = store.submitOakTurn();
    const run = runs.at(-1);
    assert.equal(run.turn.task.kind, 'question');
    assert.equal(run.turn.task.contactPreference, 'declined');
    run.callbacks.output({ answer: publicAnswer([publicRef('ecosmartloop', String(index))]), cards: [], usage: null });
    run.resolve(); await submitted;
  }
  store.beginOakAdviceDraft(); store.setOakDraft('Help me plan an interface.');
  const submitted = store.submitOakTurn();
  const run = runs.at(-1);
  assert.equal(run.turn.messages.length, 12);
  assert.equal(run.turn.task.contactPreference, 'declined');
  run.resolve(); await submitted;
});

test('guided question draft gathers both required inputs and dispatches only after explicit submission', async () => {
  const { store, runs } = workspaceFixture();
  store.requestOakWorkspace({});
  store.beginOakQuestionDraft();
  assert.deepEqual(store.getOakWorkspace().questionDraft, { topic: '', goal: '' });
  assert.equal(store.isOakDraftReady(), false);
  await store.submitOakTurn();
  assert.equal(runs.length, 0);
  assert.equal(store.getOakWorkspace().conversationId, null);
  assert.deepEqual(store.getOakWorkspace().messages, []);

  store.setOakQuestionDraftInput('goal', 'How does Steve preserve context?');
  store.setOakQuestionDraftInput('topic', '   ');
  await store.submitOakTurn();
  assert.equal(store.isOakDraftReady(), false);
  assert.equal(runs.length, 0);
  store.setOakQuestionDraftInput('goal', '');
  store.setOakQuestionDraftInput('topic', ' Memory tools ');
  await store.submitOakTurn();
  store.setOakQuestionDraftInput('goal', '   ');
  await store.submitOakTurn();
  assert.equal(store.isOakDraftReady(), false);
  assert.equal(runs.length, 0);
  // A nonempty manually edited composer cannot bypass required guided inputs.
  store.setOakDraft('Help me draft a question for Steve.');
  assert.notEqual(store.getOakWorkspace().questionDraft, null);
  await store.submitOakTurn();
  assert.equal(runs.length, 0);
  assert.equal(store.getOakWorkspace().conversationId, null);
  assert.deepEqual(store.getOakWorkspace().messages, []);

  store.setOakQuestionDraftInput('topic', 'T'.repeat(1600));
  store.setOakQuestionDraftInput('goal', 'G'.repeat(1600));
  const topic = 'T'.repeat(1500), goal = 'G'.repeat(1500);
  const text = `Help me draft a question for Steve.\nTopic: ${topic}\nWhat I want to ask: ${goal}`;
  assert.deepEqual(store.getOakWorkspace().questionDraft, { topic, goal });
  assert.equal(store.getOakWorkspace().draft, text);
  assert.ok(text.length <= 4000);
  assert.equal(store.isOakDraftReady(), true);
  assert.equal(runs.length, 0, 'filling all inputs must not dispatch');
  const submitted = store.submitOakTurn();
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0].turn.task, { kind: 'question', text, contactPreference: 'open' });
  assert.deepEqual(runs[0].turn.sourceIds, ['home-source']);
  assert.equal(store.getOakWorkspace().questionDraft, null);
  assert.equal(store.getOakWorkspace().draft, '');
  runs[0].resolve();
  await submitted;
  assert.equal(runs.length, 1);
});

test('role input preserves pasted bytes and blocks blank, overbyte and overlong intent before IDs or dispatch', async () => {
  const { store, runs } = workspaceFixture();
  store.requestOakWorkspace({});
  store.beginOakRoleDraft();
  const original = crypto.randomUUID;
  let ids = 0;
  crypto.randomUUID = () => { ids++; return original.call(crypto); };
  try {
    for (const value of ['', '  \n ', '🙂'.repeat(1001)]) {
      store.setOakRoleDraftInput('roleDescription', value);
      await store.submitOakTurn();
      assert.equal(store.getOakWorkspace().roleDraft.roleDescription, value);
      assert.equal(store.isOakDraftReady(), false);
      assert.match(store.getOakWorkspace().error, /Paste|too long/);
    }
    store.setOakRoleDraftInput('roleDescription', '🙂'.repeat(1000));
    store.setOakRoleDraftInput('intent', 'I'.repeat(401));
    await store.submitOakTurn();
    assert.equal(store.getOakWorkspace().roleDraft.intent.length, 401);
    assert.match(store.getOakWorkspace().error, /400 characters/);
    store.setOakRoleDraftInput('intent', ' ');
    await store.submitOakTurn();
    assert.match(store.getOakWorkspace().error, /Add what/);
    store.setOakRoleDraftInput('intent', 'I'.repeat(400));
    assert.equal(store.isOakDraftReady(), true, 'exact 4000-byte role and 400-character intent fit');
    assert.equal(ids, 0);
    assert.equal(runs.length, 0);
    assert.equal(store.getOakWorkspace().conversationId, null);
    assert.deepEqual(store.getOakWorkspace().messages, []);
  } finally { crypto.randomUUID = original; }
});

test('explicit role comparison sends exact separate task data and Stop restores editable inputs without late updates', async () => {
  const { store, runs, cancels } = workspaceFixture();
  store.requestOakWorkspace({});
  store.beginOakRoleDraft();
  const roleDescription = '  ROLE_ONLY_CANARY: build accessible interfaces.\nSalary is an employer proposal.  ';
  const intent = ' Compare supported work, and state gaps. ';
  store.setOakRoleDraftInput('roleDescription', roleDescription);
  store.setOakRoleDraftInput('intent', intent);
  assert.equal(runs.length, 0);
  const pending = store.submitOakTurn();
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0].turn.task, { kind: 'role-fit', text: intent.trim(), roleDescription });
  assert.deepEqual(runs[0].turn.messages, []);
  assert(!JSON.stringify(store.getOakWorkspace().messages).includes('ROLE_ONLY_CANARY'));
  assert.equal(store.getOakWorkspace().roleDraft, null);
  store.stopOakTurn();
  assert.equal(cancels.length, 1);
  assert.equal(runs[0].signal.aborted, true);
  assert.deepEqual(store.getOakWorkspace().roleDraft, { roleDescription, intent });
  assert.equal(store.getOakWorkspace().messages.at(-1).state, 'interrupted');
  runs[0].callbacks.output({ answer: null, cards: [{ kind: 'navigate', label: 'Late', url: '/work' }], usage: null });
  runs[0].resolve();
  await pending;
  assert.deepEqual(store.getOakWorkspace().messages.at(-1).cards, []);
  assert.equal(runs.length, 1);
});

test('role failure retains inputs and completed role turns never become conversational Steve evidence', async () => {
  const { store, runs } = workspaceFixture();
  store.requestOakWorkspace({});
  store.beginOakRoleDraft();
  store.setOakRoleDraftInput('roleDescription', 'ROLE_DOCUMENT_CANARY: design an interface');
  const roleDraft = store.getOakWorkspace().roleDraft;
  const failed = store.submitOakTurn();
  runs[0].reject(new Error('finite fixture failure'));
  await failed;
  assert.deepEqual(store.getOakWorkspace().roleDraft, roleDraft);
  assert.match(store.getOakWorkspace().error, /retry explicitly/);
  assert.equal(store.getOakWorkspace().messages.at(-1).state, 'failed');
  const retry = store.submitOakTurn();
  assert.equal(runs.length, 2);
  const row = { id: 'r', requirement: { text: 'design an interface', start: 22, end: 41 }, status: 'missing-evidence', evidence: [], gap: 'Public evidence is missing.', questions: ['What work should be reviewed?'] };
  runs[1].callbacks.output({ answer: { schema: 'oak.answer.v1', speaker: 'oak-ai-host', characterVersion: 'fixture', hardPolicyVersion: 'fixture', knowledgeRevision: 'fixture', operations: ['search'], kind: 'role-fit', rows: [row], contactTopics: [] }, cards: [], usage: null });
  runs[1].resolve();
  await retry;
  store.setOakDraft('Tell me about Steve\'s work.');
  const ordinary = store.submitOakTurn();
  assert.deepEqual(runs[2].turn.messages, [], 'both role user intent and role answer stay outside later conversational context');
  assert.equal(runs[2].turn.task.kind, 'question');
  assert(!JSON.stringify(runs[2].turn).includes('ROLE_DOCUMENT_CANARY'));
  store.stopOakTurn();
  runs[2].resolve();
  await ordinary;
});

test('role intake retains exact local fields through close/reopen and New clears them', () => {
  const { store, runs } = workspaceFixture();
  store.requestOakWorkspace({});
  store.beginOakRoleDraft();
  store.setOakRoleDraftInput('roleDescription', 'Visitor-scoped role text');
  store.setOakRoleDraftInput('intent', 'Review the work requirements.');
  const before = store.getOakWorkspace().roleDraft;
  store.closeOakWorkspace();
  store.requestOakWorkspace({});
  assert.deepEqual(store.getOakWorkspace().roleDraft, before);
  assert.equal(runs.length, 0);
  store.startNewOakConversation();
  assert.equal(store.getOakWorkspace().roleDraft, null);
  assert.equal(store.getOakWorkspace().questionDraft, null);
  assert.equal(store.getOakWorkspace().draft, '');
});

test('guided question draft retains unsent inputs across presentation changes and clears on new conversation', () => {
  const { store, runs, cancels } = workspaceFixture();
  store.requestOakWorkspace({});
  store.beginOakQuestionDraft();
  store.setOakQuestionDraftInput('topic', 'Agent memory tooling');
  store.setOakQuestionDraftInput('goal', 'How does Steve preserve context across sessions?');
  const before = store.getOakWorkspace();
  store.closeOakWorkspace();
  store.requestOakWorkspace({});
  assert.equal(store.getOakWorkspace().presentation, 'human-agent');
  assert.deepEqual(store.getOakWorkspace().questionDraft, before.questionDraft);
  assert.equal(store.getOakWorkspace().draft, before.draft);
  assert.equal(runs.length, 0);
  assert.equal(cancels.length, 0);
  store.startNewOakConversation();
  assert.equal(store.getOakWorkspace().questionDraft, null);
  assert.equal(store.getOakWorkspace().draft, '');
  assert.equal(store.getOakWorkspace().conversationId, null);
  assert.deepEqual(store.getOakWorkspace().messages, []);
  assert.equal(runs.length, 0);
});

test('navigation updates page context while an owned running turn stays frozen; closing interrupts once', async () => {
  const { store, runs, cancels } = workspaceFixture();
  const currentBackground = [{ inert: false }, { inert: false }];
  const nextBackground = [{ inert: false }, { inert: false }];
  let liveBackground = currentBackground;
  document.querySelectorAll = () => liveBackground;
  store.requestOakWorkspace({});
  assert.ok(currentBackground.every(element => element.inert), 'open workspace isolates the current route and header');
  store.setOakDraft('A public question');
  const submitted = store.submitOakTurn();
  assert.deepEqual(runs[0].turn.sourceIds, ['home-source']);
  const nextDocument = {
    documentElement: { dataset: {} },
    body: { dataset: { oakAgentEligible: 'true', oakMascotEligible: 'true', oakSourceIds: '["orbi-source"]' } },
    querySelectorAll: () => nextBackground,
  };
  const beforeSwap = new Event('astro:before-swap');
  beforeSwap.newDocument = nextDocument;
  document.dispatchEvent(beforeSwap);
  assert.ok(nextBackground.every(element => element.inert), 'new route is isolated before the body swap commits');
  assert.equal(nextDocument.documentElement.dataset.oakPresentation, 'human-agent');
  liveBackground = nextBackground;
  document.body = nextDocument.body;
  window.location.pathname = '/work/ecosmartloop';
  document.dispatchEvent(new Event('astro:after-swap'));
  document.dispatchEvent(new Event('astro:page-load'));
  assert.ok(nextBackground.every(element => element.inert), 'reconciliation retains isolation on the replacement body');
  assert.equal(store.getOakWorkspace().presentation, 'human-agent');
  assert.equal(store.getOakWorkspace().pending, true);
  assert.equal(runs.length, 1, 'navigation does not dispatch another turn');
  assert.equal(cancels.length, 0, 'navigation does not implicitly close the running workspace');
  assert.equal(store.getOakWorkspace().route, '/work/ecosmartloop');
  assert.deepEqual(store.getOakWorkspace().sourceIds, ['orbi-source']);
  assert.deepEqual(runs[0].turn.sourceIds, ['home-source']);
  assert.ok(store.getOakWorkspace().messages.every((message) => message.page === '/'));
  store.closeOakWorkspace();
  store.closeOakWorkspace();
  assert.ok(nextBackground.every(element => !element.inert), 'Close returns the replacement route to interactive Human browsing');
  assert.equal(cancels.length, 1);
  assert.equal(runs[0].signal.aborted, true);
  assert.equal(store.getOakWorkspace().draft, 'A public question');
  assert.equal(store.getOakWorkspace().messages[0].state, 'complete');
  assert.equal(store.getOakWorkspace().messages[1].state, 'interrupted');
  runs[0].callbacks.progress('Obsolete background progress');
  runs[0].resolve();
  await submitted;
  assert.equal(store.getOakWorkspace().presentation, 'human-browse');
  assert.equal(store.getOakWorkspace().progress, '');
  store.requestOakWorkspace({});
  assert.ok(nextBackground.every(element => element.inert), 'reopening isolates the replacement route');
  store.closeOakWorkspace();
  assert.ok(nextBackground.every(element => !element.inert), 'browsing releases isolation');
});

test('new conversation clears only local state and rejects late output/cancel errors without dispatching', async () => {
  const { store, runs, cancels, failCancel } = workspaceFixture();
  store.requestOakWorkspace({});
  store.setOakDraft('Old turn');
  const submitted = store.submitOakTurn();
  store.startNewOakConversation();
  failCancel();
  runs[0].callbacks.output({ answer: {}, cards: [], usage: null });
  runs[0].resolve();
  await submitted;
  await Promise.resolve();
  assert.equal(runs.length, 1);
  assert.equal(cancels.length, 1);
  assert.equal(store.getOakWorkspace().conversationId, null);
  assert.deepEqual(store.getOakWorkspace().messages, []);
  assert.equal(store.getOakWorkspace().draft, '');
  assert.equal(store.getOakWorkspace().error, null);
  assert.equal(store.getOakWorkspace().presentation, 'human-agent');
  assert.equal(store.getOakWorkspace().route, '/');
  assert.deepEqual(store.getOakWorkspace().sourceIds, ['home-source']);
});

test('rapid close/reopen keeps latest focus intent and ignores retired audience attributes', () => {
  const { store, document, runs } = workspaceFixture();
  store.requestOakWorkspace({});
  store.closeOakWorkspace();
  const closedIntent = store.getOakPresentationVersion();
  document.documentElement.dataset.audienceMode = 'machine';
  assert.equal(store.requestOakWorkspace({}), true);
  assert.ok(store.getOakPresentationVersion() > closedIntent);
  assert.equal(store.oakReturnFocus(), false);
  assert.equal(store.getOakWorkspace().presentation, 'human-agent');
  assert.equal(document.documentElement.dataset.audienceMode, undefined);
  assert.equal(runs.length, 0);
});

test('public mascot-free route admits agent entry; excluded utility route closes and refuses it', () => {
  const { store, document, window, runs } = workspaceFixture();
  document.body.dataset.oakMascotEligible = 'false';
  window.location.pathname = '/work/agentic-brain';
  document.dispatchEvent(new Event('astro:after-swap'));
  assert.equal(store.getOakWorkspace().mascotEligible, false);
  assert.equal(store.requestOakWorkspace({}), true);
  store.setOakDraft('Retained unsent draft');
  document.body.dataset.oakAgentEligible = 'false';
  window.location.pathname = '/owner/services';
  document.dispatchEvent(new Event('astro:after-swap'));
  assert.equal(store.getOakWorkspace().presentation, 'human-browse');
  assert.equal(store.requestOakWorkspace({}), false);
  assert.equal(store.getOakWorkspace().draft, 'Retained unsent draft');
  assert.equal(runs.length, 0);
});


test('eligible route snapshots preserve exact reading state across optional-island removal', () => {
  const orbi = lifecycle.retainMascotReadingState('/work/ecosmartloop');
  orbi.collapsed = true;
  orbi.speech = { key: 12, contextId: 'ecosmartloop.hero', text: 'Retained authored note', animation: 'ecosmartloopOrbiGuide' };
  orbi.typedText = 'Retained';
  orbi.frame = 3;
  orbi.activeContext = 'ecosmartloop.hero';
  const otherRoute = lifecycle.retainMascotReadingState('/work/linkedin-growth-loop');
  otherRoute.collapsed = false;
  const restored = lifecycle.retainMascotReadingState('/work/ecosmartloop/');
  assert.equal(restored, orbi);
  assert.equal(restored.collapsed, true);
  assert.equal(restored.speech.key, 12);
  assert.equal(restored.typedText, 'Retained');
  assert.equal(restored.frame, 3);
  assert.equal(restored.activeContext, 'ecosmartloop.hero');
  assert.notEqual(restored, otherRoute);
});


test('new competing overlay cancels owned work and retains local state; existing menu -> Oak entry can close', async () => {
  const { store, runs, cancels, observeOverlay } = workspaceFixture();
  document.documentElement.dataset.menuOpen = 'true';
  observeOverlay();
  assert.equal(store.getOakWorkspace().overlayActive, true);
  store.requestOakWorkspace({});
  observeOverlay();
  assert.equal(store.getOakWorkspace().presentation, 'human-agent');
  document.documentElement.dataset.menuOpen = 'false';
  observeOverlay();
  store.setOakDraft('An interrupted question');
  const submitted = store.submitOakTurn();
  document.documentElement.dataset.menuOpen = 'true';
  observeOverlay();
  assert.equal(store.getOakWorkspace().presentation, 'human-browse');
  assert.equal(store.getOakWorkspace().overlayActive, true);
  assert.equal(store.oakReturnFocus(), false);
  assert.equal(cancels.length, 1);
  assert.equal(store.getOakWorkspace().messages[1].state, 'interrupted');
  assert.equal(store.getOakWorkspace().draft, 'An interrupted question');
  runs[0].resolve();
  await submitted;
});

test('Stop retains an already validated application card and unsent draft without another submission', async () => {
  const { store, runs, cancels } = workspaceFixture();
  store.requestOakWorkspace({});
  store.setOakDraft('Show a public source');
  const submitted = store.submitOakTurn();
  const card = { kind: 'navigate', label: 'Reviewed public work', url: 'https://steveoak.com/work/ecosmartloop' };
  runs[0].callbacks.output({ answer: null, cards: [card], usage: null });
  store.setOakDraft('My unsent next question');
  store.stopOakTurn();
  assert.equal(cancels.length, 1);
  assert.equal(store.getOakWorkspace().draft, 'My unsent next question');
  assert.equal(store.getOakWorkspace().messages[1].state, 'interrupted');
  assert.deepEqual(store.getOakWorkspace().messages[1].cards, [card]);
  runs[0].callbacks.output({ answer: null, cards: [], usage: null });
  runs[0].resolve(); await submitted;
  assert.deepEqual(store.getOakWorkspace().messages[1].cards, [card]);
  assert.equal(runs.length, 1);
});


test('current public research sends only the catalogue topic, never asks, and never uses role or brief text', async () => {
  // v3 review (intentional update): research runs without asking; the Worker sends the topic's fixed public query.
  const { store, runs } = workspaceFixture();
  store.requestOakWorkspace({});
  store.setOakDraft('Confidential client: what is the current AI SDK streaming guidance?');
  assert.equal(store.getOakResearchNeed().requiresConsent, false);
  assert.equal(store.setOakResearchConsent, undefined, 'there is nothing to approve');
  const submit = store.submitOakTurn();
  const outbound = runs[0].turn.publicResearch;
  assert.deepEqual(outbound, { topicId: 'ai-sdk-streaming' });
  assert(!JSON.stringify(outbound).includes('Confidential client'));
  assert.deepEqual(store.getOakWorkspace().messages.at(-1).steps.map(step => step.operation), ['research'], 'the research step shows from the start');
  runs[0].callbacks.output({ answer: publicAnswer([publicRef('ecosmartloop', 'app')]), cards: [], usage: null });
  runs[0].resolve(); await submit;
  store.beginOakRoleDraft();
  store.setOakRoleDraftInput('roleDescription', 'Confidential current AI SDK company requirements');
  assert.equal(store.getOakResearchNeed(), null);
  store.leaveOakRoleDraft();
  store.openOakContactBrief();
  store.setOakContactBriefInput('goals', 'Current AI SDK PRIVATE_BRIEF');
  store.setOakDraft('What did Steve build?');
  assert.equal(store.getOakResearchNeed(), null);
  const next = store.submitOakTurn();
  assert.equal(runs[1].turn.publicResearch, undefined);
  runs[1].resolve(); await next;
});

const availableVoiceStatus = () => ({ schemaVersion: 1, service: 'transcription', enabled: true, admission: 'available', failure: 'none',
  evidence: { settings: 'verified', providerUsage: 'verified', localReservations: 'verified' },
  allowance: { unit: 'micro-usd', limit: 100000, providerObserved: 0, reserved: 0, conservativeUsed: 0, remainingBound: 100000,
    periodStart: null, periodEnd: null, reset: 'unknown' },
  health: { lastCheckAt: Date.now(), settingsObservedAt: Date.now(), usageObservedAt: Date.now(), lastAttemptAt: null, lastSuccessAt: null,
    accepted: 0, failed: 0, timedOut: 0 } });

test('voice entry reads capacity only; exact edited transcript stays local through close/reopen/navigation and needs Use then Send', async () => {
  const { store, runs, voiceWorkspace } = workspaceFixture(), savedFetch = globalThis.fetch, requests = [];
  globalThis.fetch = async (url, init) => { requests.push({ url, init }); return Response.json(availableVoiceStatus()); };
  try {
    store.requestOakWorkspace({}); store.setOakDraft('Existing typed question');
    assert.equal(requests.length, 0);
    await store.openOakVoiceInput();
    assert.equal(requests.length, 1); assert.equal(requests[0].url, '/api/oak/transcription/status');
    assert.equal(requests[0].init.body, undefined); assert.equal(runs.length, 0);
    assert.equal(store.getOakWorkspace().draft, 'Existing typed question');
    const capture = voiceWorkspace.getOakVoiceController(), exact = '  My edited visitor question\nwith exact spacing.  ';
    capture.edit(exact);
    store.closeOakWorkspace(); assert.equal(capture.getSnapshot().transcript, exact); assert.equal(store.getOakWorkspace().voiceOpen, false);
    store.requestOakWorkspace({});
    await store.openOakVoiceInput(); assert.equal(capture.getSnapshot().transcript, exact);
    window.location.pathname = '/work/ecosmartloop'; document.dispatchEvent(new Event('astro:after-swap'));
    assert.equal(store.getOakWorkspace().voiceOpen, false); assert.equal(capture.getSnapshot().transcript, exact);
    await store.openOakVoiceInput();
    assert.equal(store.useOakVoiceTranscript('x'.repeat(4001)), false); assert.equal(store.getOakWorkspace().draft, 'Existing typed question');
    assert.equal(store.useOakVoiceTranscript(exact), true); assert.equal(store.getOakWorkspace().draft, exact); assert.equal(runs.length, 0);
    assert.equal(store.getOakWorkspace().voiceOpen, false);
    const sent = store.submitOakTurn(); assert.equal(runs.length, 1); assert.equal(runs[0].turn.task.text, exact.trim());
    assert(!JSON.stringify(runs[0].turn).includes('transcript') && !JSON.stringify(runs[0].turn).includes('audio'));
    runs[0].resolve(); await sent;
    store.startNewOakConversation(); assert.equal(capture.getSnapshot().transcript, ''); assert.equal(store.getOakWorkspace().draft, '');
    assert.equal(runs.length, 1, 'New cannot upload or submit');
  } finally { globalThis.fetch = savedFetch; }
});

test('late voice capacity response cannot revive a closed panel; malformed and oversized status fail closed without changing typing', async () => {
  const { store, runs, voiceWorkspace } = workspaceFixture(), savedFetch = globalThis.fetch;
  let release, signal;
  globalThis.fetch = (_url, init) => { signal = init.signal; return new Promise(resolve => { release = resolve; }); };
  try {
    store.requestOakWorkspace({}); store.setOakDraft('Typed input kept');
    const opening = store.openOakVoiceInput(); store.closeOakWorkspace(); assert.equal(signal.aborted, true); await opening;
    release(Response.json(availableVoiceStatus())); await new Promise(resolve => setImmediate(resolve));
    assert.equal(store.getOakWorkspace().voiceOpen, false); assert.equal(store.getOakWorkspace().voiceConfiguration.enabled, false);
    store.requestOakWorkspace({});
    for (const value of [{ ...availableVoiceStatus(), apiKey: 'PRIVATE' }, { ...availableVoiceStatus(), health: { ...availableVoiceStatus().health, accepted: -1 } }]) {
      globalThis.fetch = async () => Response.json(value); await store.openOakVoiceInput();
      assert.equal(store.getOakWorkspace().voiceConfiguration.enabled, false); assert.equal(store.getOakWorkspace().draft, 'Typed input kept');
    }
    let cancelled = 0;
    globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(8193))); }, cancel() { cancelled++; } }));
    await store.openOakVoiceInput(); assert.equal(cancelled, 1); assert.equal(store.getOakWorkspace().voiceConfiguration.enabled, false);
    voiceWorkspace.getOakVoiceController().edit('Local transcript'); store.beginOakRoleDraft(); assert.equal(store.getOakWorkspace().voiceOpen, false);
    assert.equal(store.useOakVoiceTranscript('Must not replace role'), false); assert.equal(runs.length, 0);
    store.startNewOakConversation();
  } finally { globalThis.fetch = savedFetch; }
});

test('D16-G1 a 429 turn becomes an allowance failure with no retry, and keeps the question in the transcript', async () => {
  const { store, runs } = workspaceFixture();
  store.requestOakWorkspace({});
  store.setOakDraft('Who built the classifier?');
  const failed = store.submitOakTurn();
  runs[0].reject(new Error('allowance-unavailable'));
  await failed;
  const state = store.getOakWorkspace();
  const last = state.messages.at(-1);
  assert.equal(last.state, 'failed');
  assert.equal(last.failure, 'allowance');
  assert.match(state.error, /used the answers available for now/);
  // Q03-G5 (intentional update): sending it again meets the same limit, so the stale question leaves the box.
  assert.equal(state.draft, '');
  assert.equal(state.messages.at(-2).text, 'Who built the classifier?');
  assert.equal(store.oakRetryKind(state, last.id), null, 'sending again would meet the same limit');
});

test('D20-G2 only a fetch-level network error marks a turn offline; known server errors keep their own notice', async () => {
  const { store } = workspaceFixture();
  const classify = store.oakTurnFailure;
  for (const message of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'network error'])
    assert.equal(classify(new TypeError(message)), 'offline', message);
  assert.equal(classify(new TypeError('Cannot read properties of undefined')), undefined, 'a code bug is not a dropped connection');
  assert.equal(classify(new Error('allowance-unavailable')), 'allowance');
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
  try {
    assert.equal(classify(new Error('sign-in-required')), undefined, 'offline never overrides a known server error');
    assert.equal(classify(new TypeError('Unexpected end of input')), 'offline', 'a TypeError while the browser is offline is the connection');
  } finally {
    if (saved) Object.defineProperty(globalThis, 'navigator', saved); else delete globalThis.navigator;
  }
  const { store: live, runs } = workspaceFixture();
  live.requestOakWorkspace({});
  live.setOakDraft('Who built the classifier?');
  const failed = live.submitOakTurn();
  runs[0].reject(new TypeError('Failed to fetch'));
  await failed;
  const state = live.getOakWorkspace();
  assert.equal(state.messages.at(-1).failure, 'offline');
  assert.match(state.error, /connection dropped/);
  assert.equal(live.oakRetryKind(state, state.messages.at(-1).id), 'resend', 'a dropped connection can be retried');
});

// PR 1d review: the removed page chip survives the sign-in handoff for the same conversation, and a new page brings it back.
test('PR1D a removed page chip stays removed after the sign-in handoff resumes, and a new page re-arms it', async () => {
  const retained = { conversationId: null, draft: 'Kept words', draftKind: 'question', contactPreference: 'open', questionDraft: null, roleDraft: null,
    briefDraft: null, messages: [], pageContextOff: true };
  const { store, window, document } = workspaceFixture({ read: () => retained });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(store.getOakWorkspace().draft, 'Kept words', 'the handoff resumed');
  assert.equal(store.getOakWorkspace().pageContextOff, true, 'the removed page chip is still removed');
  window.location.pathname = '/work';
  document.dispatchEvent(new Event('astro:page-load'));
  assert.equal(store.getOakWorkspace().pageContextOff, false, 'a new page brings the chip back');
});

test('PR1D a removed page chip comes back in a new conversation, but naming the first conversation keeps it off', () => {
  const { store } = workspaceFixture();
  store.requestOakWorkspace({});
  store.setOakPageContext(false);
  store.setOakDraft('First question');
  store.openOakSurface('documents'); // names the conversation without leaving it
  assert.notEqual(store.getOakWorkspace().conversationId, null);
  assert.equal(store.getOakWorkspace().pageContextOff, true, 'naming the conversation keeps the chip off');
  store.startNewOakConversation();
  assert.equal(store.getOakWorkspace().pageContextOff, false, 'a new conversation brings the chip back');
  store.setOakPageContext(false);
  store.startNewOakConversation();
  assert.equal(store.getOakWorkspace().pageContextOff, false, 'also when no conversation was named yet');
});
