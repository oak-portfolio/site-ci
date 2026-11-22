import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoader, stubSets, stubbedLoader as loader } from "./design-rework/load-tsx.mjs";

const cid = '11111111-1111-4111-8111-111111111111';
const rid = '22222222-2222-4222-8222-222222222222';
const answer = { schema: 'oak.answer.v1', speaker: 'oak-ai-host', characterVersion: 'historical-character', hardPolicyVersion: 'historical-policy',
  knowledgeRevision: 'historical-knowledge', operations: ['read'], kind: 'sourced', acknowledgment: null,
  claims: [{ id: 'claim-one', text: 'A full historical public answer.', citations: [{ documentId: 'work:ecosmartloop', passageId: 'old-passage',
    sectionId: 'old-section', url: 'https://steveoak.com/work/ecosmartloop/#proof' }] }] };
const messages = id => [{ id: `${id}:user`, role: 'user', text: 'What was built?', answer: null, cards: [], page: '/', taskKind: 'question' },
  { id, role: 'assistant', text: answer.claims[0].text, answer, cards: [{ kind: 'navigate', label: 'Read source', url: 'https://steveoak.com/work/ecosmartloop' }],
    page: '/', taskKind: 'question', research: { requestId: id, topicId: 'workers-limits', provider: 'Exa', phase: 'zero-results', reason: 'none', returnedSources: 0, sources: [] } }];
const savedAt = Date.now();
const record = (rows = messages(rid), version = 1, interruptedTurns = []) => ({ conversationId: cid, version, messages: rows, interruptedTurns,
  createdAt: savedAt, lastSavedMessageAt: savedAt + version, updatedAt: savedAt + version, expiresAt: savedAt + version + 30 * 24 * 60 * 60 * 1000,
  lastNewSavedMessageId: rows.at(-1).id });
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture({ signedIn = true, timers = false, crossTab = false } = {}) {
  let context = { epoch: 1, accountVersion: 1, authenticated: signedIn };
  let status = { configured: true, kind: signedIn ? 'account' : 'guest', phase: signedIn ? 'ready' : 'guest', role: 'visitor', publishableKey: null, purpose: 'exploring',
    allowance: { answers: { limit: 6, remaining: 6, refillsAt: null }, window: { completed: 0, pending: 0, limit: 100, remaining: 100 } } };
  const contextCallbacks = new Set(), requests = [], runs = [], cancels = [], handoffClears = [], deadlines = new Map(); let timerId = 0;
  let respond = () => Response.json(record());
  const account = {
    getOakAccountPurpose: () => null, // Q08 (intentional update)
    getOakAccountContext: () => ({ ...context }),
    subscribeOakAccountContext: cb => { contextCallbacks.add(cb); return () => contextCallbacks.delete(cb); },
    oakAuthorizationHeaders: async () => context.authenticated ? { Authorization: 'Bearer unit.header.signature' } : {},
    readOakAuthStatus: async () => status,
    continueOakAccount: async () => status,
    resumeOakAccount: async () => true,
  };
  const downloads = [], revoked = [];
  const document = Object.assign(new EventTarget(), { documentElement: { dataset: {} }, body: { dataset: { oakAgentEligible: 'true', oakMascotEligible: 'true', oakSourceIds: '[]' }, append() {} },
    createElement: () => ({ href: '', download: '', click() { downloads.push({ href: this.href, filename: this.download }); }, remove() {} }),
    querySelectorAll: () => [], querySelector: () => null });
  const window = Object.assign(new EventTarget(), { location: { pathname: '/' }, innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980 });
  const channels = [];
  if (crossTab) window.BroadcastChannel = class { constructor() { this.sent = []; channels.push(this); } postMessage(value) { this.sent.push(value); } close() {} };
  const load = createLoader({ use: [stubSets.react, stubSets.workspaceStore({ account,
    handoff: { saveOakAuthHandoff: () => true, readOakAuthHandoff: () => null, clearOakAuthHandoff() {}, clearOakConversationHandoff: id => handoffClears.push(id) },
    transport: {
      streamOakTurn: (turn, signal, callbacks) => new Promise((resolve, reject) => runs.push({ turn, signal, callbacks, resolve, reject })),
      cancelOakTurn: (...args) => { cancels.push(args); return Promise.resolve(); },
    } })], globals: { window, document, MutationObserver: class { observe() {} disconnect() {} },
    URL: class extends URL { static createObjectURL() { return 'blob:fixture-export'; } static revokeObjectURL(url) { revoked.push(url); } },
    fetch: async (url, options) => { requests.push({ url, options }); return respond(url, options); },
    ...(timers ? { setTimeout: fn => { deadlines.set(++timerId, fn); return timerId; }, clearTimeout: id => deadlines.delete(id) } : {}) } });
  const client = load('src/lib/oakSavedHistoryClient.ts');
  const store = load('src/lib/oakWorkspace.ts');
  store.installOakPresentationOwner(); store.requestOakWorkspace({});
  const setContext = value => { context = { ...context, ...value }; for (const cb of contextCallbacks) cb(); };
  const complete = async (text = 'What was built?') => {
    store.setOakDraft(text); const pending = store.submitOakTurn(); const run = runs.at(-1);
    assert(run, 'explicit submit dispatched');
    run.callbacks.output({ answer, cards: messages(rid)[1].cards, research: { ...messages(rid)[1].research, requestId: run.turn.requestId }, usage: { state: 'settled', actualMicroUsd: 123 } });
    run.resolve(); await pending; return run;
  };
  return { store, client, funding: load('src/lib/oakFundingSession.ts'), requests, runs, cancels, deadlines, handoffClears, downloads, revoked, channels, window, document, setContext, complete, setStatus: value => { status = value; },
    respond: fn => { respond = fn; }, account, status };
}

function connectGuard(f) {
  const token = f.funding.oakFundingMemory.begin();
  f.funding.oakFundingMemory.accept(token, { kind: 'connection', session: { tabId: rid, handle: 'H'.repeat(43) },
    status: { state: 'connected', expiresAt: Date.now() + 120_000 } });
}
async function savedPrefix(f) {
  await f.complete();
  f.respond((_url, options) => {
    const input = JSON.parse(options.body);
    return Response.json({ ...record(input.messages), conversationId: input.conversationId, interruptedTurns: input.interruptedTurns ?? [] });
  });
  await f.store.saveOakCurrentConversation();
  assert(f.store.getOakWorkspace().savedRecord, 'explicit safe prefix acknowledged');
}

test('credential rejection removes the submitted unit before automatic or later explicit Save after disconnect', async () => {
  const f = fixture(); await savedPrefix(f); connectGuard(f);
  const prefix = f.store.getOakWorkspace().messages, before = f.requests.length, canary = 'ordinary/key_"canary';
  f.store.setOakDraft(`Question contains ${canary}`);
  const pending = f.store.submitOakTurn(), run = f.runs.at(-1);
  run.reject(new Error('credential-in-content')); await pending; await tick();
  assert.deepEqual(f.store.getOakWorkspace().messages, prefix);
  assert.equal(f.store.getOakWorkspace().draft, ''); assert.match(f.store.getOakWorkspace().error, /rejected turn was removed/);
  assert.equal(f.requests.length, before, 'no automatic append after credential rejection');
  f.funding.oakFundingMemory.clear();
  await f.store.saveOakCurrentConversation();
  assert.equal(f.requests.length, before, 'explicit Save has no secret-bearing delta');
  assert(!JSON.stringify(f.client.projectOakSavedHistory(f.store.getOakWorkspace())).includes(canary));
  assert(!JSON.stringify(f.requests).includes(canary));
});

test('Stop before connected safety acknowledgment removes the unreviewed unit and cannot save it after disconnect', async () => {
  const f = fixture(); await savedPrefix(f); connectGuard(f);
  const prefix = f.store.getOakWorkspace().messages, before = f.requests.length, canary = 'ordinary/key_canary';
  f.store.setOakDraft(canary); const pending = f.store.submitOakTurn(), run = f.runs.at(-1);
  f.store.stopOakTurn(); run.reject(new DOMException('Stopped', 'AbortError')); await pending; await tick();
  assert.deepEqual(f.store.getOakWorkspace().messages, prefix); assert.equal(f.store.getOakWorkspace().draft, '');
  assert.match(f.store.getOakWorkspace().error, /before the spending-credential check/);
  f.funding.oakFundingMemory.clear(); await f.store.saveOakCurrentConversation();
  assert.equal(f.requests.length, before); assert(!JSON.stringify(f.client.projectOakSavedHistory(f.store.getOakWorkspace())).includes(canary));
});

test('safe acknowledged interruption preserves the existing interrupted-save semantics', async () => {
  const f = fixture(); connectGuard(f); f.store.setOakDraft('Safe public question');
  const pending = f.store.submitOakTurn(), run = f.runs.at(-1);
  run.callbacks.progress('Preparing an answer', null); f.store.stopOakTurn(); run.reject(new DOMException('Stopped', 'AbortError')); await pending;
  const projected = f.client.projectOakSavedHistory(f.store.getOakWorkspace());
  assert.equal(projected.messages[0].text, 'Safe public question'); assert.equal(projected.interruptedTurns.length, 1);
  assert.equal(f.store.getOakWorkspace().draft, 'Safe public question');
});

test('unavailable or expired custody before acknowledgment cannot leave a savable interrupted secret after disconnect', async () => {
  const f = fixture(); await savedPrefix(f); connectGuard(f);
  const prefix = f.store.getOakWorkspace().messages, before = f.requests.length, canary = 'ordinary/key_canary';
  f.store.setOakDraft(canary); const pending = f.store.submitOakTurn(), run = f.runs.at(-1);
  run.reject(new Error('answer-unavailable')); await pending;
  assert.deepEqual(f.store.getOakWorkspace().messages, prefix); assert.equal(f.store.getOakWorkspace().draft, '');
  assert.match(f.store.getOakWorkspace().error, /check could not finish/);
  f.funding.oakFundingMemory.clear(); await f.store.saveOakCurrentConversation();
  assert.equal(f.requests.length, before); assert(!JSON.stringify(f.client.projectOakSavedHistory(f.store.getOakWorkspace())).includes(canary));
});

test('checked safe funding/auth failure preserves retry draft and normal interrupted projection', async () => {
  for (const error of ['allowance-unavailable', 'purpose-required']) {
    const f = fixture(); connectGuard(f); f.store.setOakDraft('Safe public question');
    const pending = f.store.submitOakTurn(), run = f.runs.at(-1);
    run.callbacks.safetyChecked(); run.reject(new Error(error)); await pending;
    // Q03-G5 (intentional update): a quota stop no longer puts the stale question back in the box; it stays in the transcript and history.
    assert.equal(f.store.getOakWorkspace().draft, error === 'allowance-unavailable' ? '' : 'Safe public question');
    assert.equal(f.client.projectOakSavedHistory(f.store.getOakWorkspace()).messages[0].text, 'Safe public question');
  }
});

test('history guard stays outside canonical DTO while connected sponsorship is selected', async () => {
  const f = fixture(); connectGuard(f); f.respond(() => Response.json(record()));
  await f.client.saveOakConversation({ intent: 'explicit-save', conversationId: cid, messages: messages(rid) });
  const request = f.requests.at(-1);
  assert.deepEqual(JSON.parse(request.options.headers['X-Oak-Funding-Guard']), { tabId: rid, handle: 'H'.repeat(43) });
  assert(!request.options.body.includes('H'.repeat(43))); assert(!request.options.body.includes('X-Oak-Funding-Guard'));
  assert.equal(f.funding.getOakFundingSelection().funding, 'sponsored');
});

test('actual chat transport preserves only the strict safe credential rejection code without body disclosure', async () => {
  const load = loader({ ai: {}, './oakAccountClient': { getOakAccountPurpose: () => null, oakAuthorizationHeaders: async () => ({}) } }, { // Q08 (intentional update)
    fetch: async () => Response.json({ error: 'credential-in-content' }, { status: 400 }),
  });
  const transport = load('src/lib/oakWorkspaceTransport.ts');
  await assert.rejects(transport.streamOakTurn({ requestId: rid, conversationId: cid }, new AbortController().signal, {}), error => error.message === 'credential-in-content');
  const malformed = loader({ ai: {}, './oakAccountClient': { getOakAccountPurpose: () => null, oakAuthorizationHeaders: async () => ({}) } }, { // Q08 (intentional update)
    fetch: async () => Response.json({ error: 'credential-in-content', provider: 'ordinary/key_canary' }, { status: 400 }),
  });
  await assert.rejects(malformed('src/lib/oakWorkspaceTransport.ts').streamOakTurn({ requestId: rid, conversationId: cid }, new AbortController().signal, {}), error => error.message === 'answer-unavailable');
});

test('actual transport accepts only exact checked acknowledgment before safe funding rejection', async () => {
  for (const value of ['checked', 'Checked', 'checked extra']) {
    let acknowledged = 0;
    const load = loader({ ai: {}, './oakAccountClient': { getOakAccountPurpose: () => null, oakAuthorizationHeaders: async () => ({}) } }, { // Q08 (intentional update)
      fetch: async () => Response.json({ error: 'funding-exhausted' }, { status: 429, headers: { 'X-Oak-Funding-Safety': value } }),
    });
    await assert.rejects(load('src/lib/oakWorkspaceTransport.ts').streamOakTurn({ requestId: rid, conversationId: cid }, new AbortController().signal,
      { safetyChecked: () => { acknowledged++; } }), error => error.message === 'allowance-unavailable');
    assert.equal(acknowledged, value === 'checked' ? 1 : 0);
  }
});
