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

function fixture({ signedIn = true, timers = false, crossTab = false, transport = null, extraOverrides = {} } = {}) {
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
      streamOakTurn: transport ?? ((turn, signal, callbacks) => new Promise((resolve, reject) => runs.push({ turn, signal, callbacks, resolve, reject }))),
      cancelOakTurn: (...args) => { cancels.push(args); return Promise.resolve(); },
    } })], stubs: extraOverrides, globals: { window, document, MutationObserver: class { observe() {} disconnect() {} },
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

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function connected(funding) {
  const token = funding.oakFundingMemory.begin();
  funding.oakFundingMemory.accept(token, { kind: 'connection', session: { tabId: rid, handle: 'H'.repeat(43) },
    status: { state: 'connected', expiresAt: Date.now() + 120_000 } });
  return funding.oakFundingContentGuardHeaders();
}

test('real sponsored contact transport retains entry guard across delayed SDK/auth and custody clear', async () => {
  for (const [clearDuring, kind] of [['sdk', 'contact'], ['auth', 'contact'], ['sdk', 'decline'], ['auth', 'decline']]) {
    const sdk = deferred(), auth = deferred(), authStarted = deferred(), requests = [], traces = [];
    let safetyAccepted = 0, outputAccepted = 0;
    const load = loader({ ai: sdk.promise, './oakAccountClient': { getOakAccountPurpose: () => null, oakAuthorizationHeaders: () => { authStarted.resolve(); return auth.promise; } } }, { // Q08 (intentional update)
      fetch: async (_url, options) => {
        requests.push(options);
        if (!options.headers['X-Oak-Funding-Guard']) traces.push(JSON.parse(options.body).turn);
        return Response.json({ error: 'funding-reconnect-required' }, { status: 409 });
      },
    });
    const funding = load('src/lib/oakFundingSession.ts'), snapshot = connected(funding);
    assert(Object.isFrozen(snapshot)); assert.equal(funding.getOakFundingSelection().funding, 'sponsored');
    const task = { requestId: rid, conversationId: cid, task: { kind: kind === 'decline' ? 'decline' : 'question',
      text: kind === 'decline' ? 'No thanks.' : 'Is Steve available? ordinary/key_canary' }, funding: 'sponsored',
      messages: kind === 'decline' ? [{ role: 'user', content: 'ordinary/key_canary' }] : [], sourceIds: [] };
    const pending = load('src/lib/oakWorkspaceTransport.ts').streamOakTurn(task, new AbortController().signal, {
      safetyChecked: () => { safetyAccepted++; }, output: () => { outputAccepted++; }, progress() {},
    });
    if (clearDuring === 'sdk') funding.oakFundingMemory.clear();
    sdk.resolve({}); await authStarted.promise;
    if (clearDuring === 'auth') funding.oakFundingMemory.clear();
    // ac2e6801b passes a 409 reconnect code through so the composer can ask to reconnect funding.
    auth.resolve({}); await assert.rejects(pending, /funding-reconnect-required/);
    assert.deepEqual(JSON.parse(requests[0].headers['X-Oak-Funding-Guard']), JSON.parse(snapshot['X-Oak-Funding-Guard']));
    assert.equal(JSON.parse(requests[0].body).visitorSession, undefined, 'sponsored request has no body fallback');
    assert.equal(safetyAccepted, 0); assert.equal(outputAccepted, 0); assert.deepEqual(traces, []);
  }
});

test('submission snapshot is frozen before update listeners and unreviewed failed unit cannot be Saved after disconnect', async () => {
  let passedGuard, release;
  const f = fixture({ transport: (_turn, _signal, _callbacks, _visitorSession, guard) => {
    passedGuard = guard; return new Promise((_resolve, reject) => { release = reject; });
  } });
  const snapshot = connected(f.funding), canary = 'ordinary/key_canary';
  f.store.setOakDraft(`Is Steve available? ${canary}`);
  const unsubscribe = f.store.subscribeOakWorkspace(() => { if (f.store.getOakWorkspace().pending) f.funding.oakFundingMemory.clear(); });
  const pending = f.store.submitOakTurn(); unsubscribe();
  assert.deepEqual(passedGuard, snapshot); assert(Object.isFrozen(passedGuard));
  release(new Error('answer-unavailable')); await pending;
  assert.equal(f.store.getOakWorkspace().messages.length, 0); assert.equal(f.store.getOakWorkspace().draft, '');
  const projected = f.client.projectOakSavedHistory(f.store.getOakWorkspace());
  assert(!JSON.stringify(projected).includes(canary)); await f.store.saveOakCurrentConversation();
  assert.equal(f.requests.length, 0);
});

test('real history Save retains original guard across awaited auth and funding clear outside its canonical DTO', async () => {
  for (const method of ['POST', 'PATCH']) {
  const auth = deferred(), started = deferred();
  const f = fixture(); const snapshot = connected(f.funding);
  f.account.oakAuthorizationHeaders = () => { started.resolve(); return auth.promise; };
  f.respond((_url, options) => {
    assert.deepEqual(JSON.parse(options.headers['X-Oak-Funding-Guard']), JSON.parse(snapshot['X-Oak-Funding-Guard']));
    assert(!options.body.includes('H'.repeat(43)));
    return Response.json({ error: 'funding-reconnect-required' }, { status: 409 });
  });
  const pending = method === 'POST' ? f.client.saveOakConversation({ intent: 'explicit-save', conversationId: cid, messages: messages(rid) }) :
    f.client.appendOakSavedConversation({ conversationId: cid, expectedVersion: 1, messages: messages(rid) });
  await started.promise; f.funding.oakFundingMemory.clear(); auth.resolve({ Authorization: 'Bearer unit.header.signature' });
  await assert.rejects(pending, error => error.code === 'conflict');
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].options.method, method);
  }
});

test('actual workspace and actual delayed transport reject stale snapshot and exclude the submitted unit from later Save', async () => {
  const sdk = deferred(), auth = deferred(), authStarted = deferred(), sent = [], traces = [];
  const load = loader({ ai: sdk.promise, './oakAccountClient': { getOakAccountPurpose: () => null, oakAuthorizationHeaders: () => { authStarted.resolve(); return auth.promise; } } }, { // Q08 (intentional update)
    fetch: async (_url, options) => {
      sent.push(options);
      if (!options.headers['X-Oak-Funding-Guard']) traces.push(JSON.parse(options.body).turn);
      return Response.json({ error: 'funding-reconnect-required' }, { status: 409 });
    },
  });
  const f = fixture({ transport: load('src/lib/oakWorkspaceTransport.ts').streamOakTurn });
  const snapshot = connected(f.funding), canary = 'ordinary/key_canary';
  f.store.setOakDraft(`Is Steve available? ${canary}`); const pending = f.store.submitOakTurn();
  f.funding.oakFundingMemory.clear(); sdk.resolve({}); await authStarted.promise; auth.resolve({}); await pending;
  assert.deepEqual(JSON.parse(sent[0].headers['X-Oak-Funding-Guard']), JSON.parse(snapshot['X-Oak-Funding-Guard']));
  assert.deepEqual(traces, []); assert.equal(f.store.getOakWorkspace().messages.length, 0);
  assert.equal(f.store.getOakWorkspace().draft, ''); assert.match(f.store.getOakWorkspace().error, /check could not finish/);
  assert(!JSON.stringify(f.client.projectOakSavedHistory(f.store.getOakWorkspace())).includes(canary));
  await f.store.saveOakCurrentConversation(); assert.equal(f.requests.length, 0);
});
