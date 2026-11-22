import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createLoader, loadTsx, stubSets, stubbedLoader as loader } from "./design-rework/load-tsx.mjs";

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
const summary = value => { const { messages, interruptedTurns, ...rest } = value; return { ...rest, messageCount: messages.length }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture({ signedIn = true, timers = false, crossTab = false } = {}) {
  let context = { epoch: 1, accountVersion: 1, authenticated: signedIn };
  let status = { configured: true, kind: signedIn ? 'account' : 'guest', phase: signedIn ? 'ready' : 'guest', role: 'visitor', publishableKey: null, purpose: 'exploring',
    allowance: { answers: { limit: 6, remaining: 6, refillsAt: null }, window: { completed: 0, pending: 0, limit: 100, remaining: 100 } } };
  const contextCallbacks = new Set(), requests = [], runs = [], cancels = [], handoffClears = [], deadlines = new Map(); let timerId = 0;
  let respond = () => Response.json(record());
  const account = {
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
  return { store, client, documents: load('src/lib/oakDocumentsWorkspace.ts').getOakDocumentsController(), requests, runs, cancels, deadlines, handoffClears, downloads, revoked, channels, window, document, setContext, complete, setStatus: value => { status = value; },
    respond: fn => { respond = fn; }, account, status };
}

test('actual history transport is strict, authenticated, bounded and fixed-error without body disclosure', async () => {
  const f = fixture();
  await f.client.readOakSavedConversation(cid);
  assert.equal(f.requests[0].url, `/api/oak/conversations/${cid}`);
  assert.equal(f.requests[0].options.headers.Authorization, 'Bearer unit.header.signature');
  assert.equal(f.requests[0].options.credentials, 'same-origin'); assert.equal(f.requests[0].options.cache, 'no-store'); assert.equal(f.requests[0].options.redirect, 'error');
  for (const value of [{ ...record(), bearer: 'PRIVATE' }, { ...record(), messages: [{ ...messages(rid)[0], usage: 123 }, messages(rid)[1]] },
    { ...record(), messages: [messages(rid)[0], { ...messages(rid)[1], text: 'Truncated text' }] }]) {
    f.respond(() => Response.json(value)); await assert.rejects(f.client.readOakSavedConversation(cid), e => e.code === 'unavailable');
  }
  for (const [code, expected] of [[401, 'sign-in-required'], [403, 'unavailable'], [404, 'missing'], [409, 'conflict'], [500, 'unavailable']]) {
    f.respond(() => new Response('PRIVATE_PROVIDER_DETAIL', { status: code }));
    await assert.rejects(f.client.readOakSavedConversation(cid), e => e.code === expected && !e.message.includes('PRIVATE'));
  }
  // P03-G7: a non-JSON 403 is the edge spend breaker (unavailable above); only the Worker's JSON 403 means signed out.
  f.respond(() => Response.json({ error: 'invalid-identity' }, { status: 403 }));
  await assert.rejects(f.client.readOakSavedConversation(cid), e => e.code === 'sign-in-required');
  let cancelled = 0;
  f.respond(() => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(512 * 1024 + 1)); }, cancel() { cancelled++; } }), { headers: { 'Content-Type': 'application/json' } }));
  await assert.rejects(f.client.readOakSavedConversation(cid), e => e.code === 'unavailable'); assert.equal(cancelled, 1);
  const before = f.requests.length; await assert.rejects(f.client.readOakSavedConversation('../other'), e => e.code === 'invalid-input');
  await assert.rejects(f.client.listOakSavedConversations('bad/query'), e => e.code === 'invalid-input'); assert.equal(f.requests.length, before);
});

test('list validates shared page DTO, cursor, duplicates and max50 summaries', async () => {
  const f = fixture(); f.respond(() => Response.json({ conversations: [summary(record())], nextCursor: 'opaque_cursor' }));
  assert.equal((await f.client.listOakSavedConversations(null)).conversations.length, 1);
  await f.client.listOakSavedConversations('opaque_cursor'); assert.equal(f.requests.at(-1).url, '/api/oak/conversations?cursor=opaque_cursor');
  for (const value of [{ conversations: [summary(record()), summary(record())], nextCursor: null },
    { conversations: [], nextCursor: '../private' }, { conversations: [], nextCursor: null, private: true },
    { conversations: Array.from({ length: 51 }, (_, i) => ({ ...summary(record()), conversationId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` })), nextCursor: null }]) {
    f.respond(() => Response.json(value)); await assert.rejects(f.client.listOakSavedConversations(null), e => e.code === 'unavailable');
  }
});

test('deadline and caller cancellation bound uncooperative fetch and stalled bodies without retries', async () => {
  for (const stalledBody of [false, true]) {
    const f = fixture({ timers: true }); let release, cancelled = 0;
    f.respond(() => stalledBody ? new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { 'Content-Type': 'application/json' } }) : new Promise(resolve => { release = resolve; }));
    // The workspace's starters-loading timer is registered first now; fire every timer so the request deadline runs.
    const pending = f.client.readOakSavedConversation(cid); await tick(); for (const fire of [...f.deadlines.values()]) fire();
    await assert.rejects(pending, e => e.code === 'unavailable');
    if (release) { release(new Response(new ReadableStream({ cancel() { cancelled++; } }))); await tick(); }
    assert.equal(cancelled, 1); assert.equal(f.requests.length, 1);
  }
  const f = fixture(); let release; f.respond(() => new Promise(resolve => { release = resolve; }));
  const abort = new AbortController(), pending = f.client.readOakSavedConversation(cid, abort.signal); await tick(); abort.abort();
  await assert.rejects(pending, e => e.code === 'cancelled'); release(Response.json(record()));
});

test('projection preserves rich terminal pairs/version tuples while excluding partial output, drafts and authority', () => {
  const f = fixture(); const complete = messages(rid).map(message => ({ ...message, state: 'complete', usage: { secretUsage: 123 } }));
  const interruptedId = '33333333-3333-4333-8333-333333333333';
  const interrupted = messages(interruptedId).map(message => ({ ...message, state: message.role === 'assistant' ? 'interrupted' : 'complete' }));
  const pendingId = '44444444-4444-4444-8444-444444444444';
  const pending = messages(pendingId).map(message => ({ ...message, state: message.role === 'assistant' ? 'pending' : 'complete' }));
  const projected = f.client.projectOakSavedHistory({ ...f.store.getOakWorkspace(), conversationId: cid, messages: [...complete, ...interrupted, ...pending],
    draft: 'UNSENT', token: 'BEARER', purpose: 'PRIVATE_INTAKE', funding: 'PRIVATE_FUNDING' });
  assert.equal(projected.messages.length, 3); assert.equal(projected.messages[1].answer.knowledgeRevision, 'historical-knowledge');
  assert.equal(projected.messages[1].answer.claims[0].citations[0].passageId, 'old-passage'); assert.deepEqual(projected.messages[1].cards, complete[1].cards);
  assert.deepEqual(projected.interruptedTurns, [{ requestId: interruptedId, state: 'interrupted', retryIntent: 'explicit-user-action-required' }]);
  for (const sentinel of ['UNSENT', 'BEARER', 'PRIVATE_INTAKE', 'PRIVATE_FUNDING', 'secretUsage', pendingId]) assert(!JSON.stringify(projected).includes(sentinel));
  assert(!projected.messages.some(message => message.id === interruptedId));
  assert.equal(f.client.projectOakSavedHistory({ ...f.store.getOakWorkspace(), conversationId: cid, messages: [{ ...complete[0], page: '/?private-query' }, complete[1]] }), null);
});

test('sign-in and completed guest turns never upload; explicit Save acknowledgement gates queued terminal append', async () => {
  const f = fixture({ signedIn: false }); await tick(); await f.complete(); assert.equal(f.requests.length, 0);
  f.setContext({ epoch: 2, accountVersion: 1, authenticated: true }); f.setStatus({ ...f.status, kind: 'account', phase: 'ready' }); await f.store.refreshOakAuthStatus();
  assert.equal(f.requests.length, 0);
  let release, firstSnapshot;
  f.respond((_url, options) => {
    const body = JSON.parse(options.body);
    if (options.method === 'POST') { firstSnapshot = body; return new Promise(resolve => { release = resolve; }); }
    assert.equal(options.method, 'PATCH'); assert.equal(body.messages.length, 2); assert.equal(body.expectedVersion, 1);
    return Response.json({ ...record([...firstSnapshot.messages, ...body.messages], 2), conversationId: body.conversationId });
  });
  const saving = f.store.saveOakCurrentConversation(); await tick(); assert.equal(f.requests.length, 1); assert.equal(f.store.getOakWorkspace().savedRecord, null);
  await f.complete('A second explicit question'); assert.equal(f.requests.length, 1, 'completed reply waits for explicit Save ack');
  release(Response.json({ ...record(firstSnapshot.messages), conversationId: firstSnapshot.conversationId })); await saving;
  assert.equal(f.requests.length, 2); assert.equal(f.store.getOakWorkspace().savedRecord.version, 2); assert.equal(f.store.getOakWorkspace().messages.length, 4);
  assert.equal(f.runs.length, 2);
  for (const call of f.requests) { const body = JSON.parse(call.options.body); assert(!JSON.stringify(body).includes('actualMicroUsd')); assert(!JSON.stringify(body).includes('Bearer')); }
});

test('Save failure or wrong acknowledgement preserves completed text and draft without enabling appends', async () => {
  for (const mode of ['failure', 'wrong-content']) {
    const f = fixture(); await tick(); await f.complete(); f.store.setOakDraft('  exact next draft\n');
    const before = f.store.getOakWorkspace().messages;
    f.respond((_url, options) => mode === 'failure' ? new Response('PRIVATE', { status: 503 }) :
      Response.json({ ...record(JSON.parse(options.body).messages), conversationId: cid }));
    await f.store.saveOakCurrentConversation(); assert.equal(f.store.getOakWorkspace().savedRecord, null); assert(f.store.getOakWorkspace().saveError);
    assert.deepEqual(f.store.getOakWorkspace().messages, before); assert.equal(f.store.getOakWorkspace().draft, '  exact next draft\n');
    await f.complete('More explicit text'); assert.equal(f.requests.length, 1);
  }
});

test('reopen restores immutable rich history and interrupted markers with no background generation, research or voice', async () => {
  const f = fixture(); await tick(); f.store.setOakDraft('  visitor draft stays exact  ');
  const interruptedId = '33333333-3333-4333-8333-333333333333';
  const interruption = { requestId: interruptedId, state: 'interrupted', retryIntent: 'explicit-user-action-required' };
  const remote = record([...messages(rid), { ...messages(interruptedId)[0], taskKind: 'role-fit', text: 'Compare this role.' }], 2, [interruption]);
  f.respond(() => Response.json(remote)); await f.store.openOakSavedConversation(cid);
  const state = f.store.getOakWorkspace(); assert.equal(state.messages.length, 4); assert.equal(state.draft, '  visitor draft stays exact  ');
  assert.equal(state.messages[1].answer.knowledgeRevision, 'historical-knowledge'); assert.deepEqual(state.messages[1].research, remote.messages[1].research);
  assert.equal(state.messages.at(-1).state, 'interrupted'); assert.equal(state.messages.at(-1).answer, null); assert.equal(state.messages.at(-1).text, '');
  assert.deepEqual(state.messages.at(-1).cards, []); assert.equal(state.roleDraft, null); assert.equal(state.voiceOpen, false);
  assert(state.messages.every(message => message.usage === null)); assert.equal(f.runs.length, 0); assert.equal(f.requests.length, 1);
  f.store.startNewOakConversation(); assert.equal(f.store.getOakWorkspace().savedRecord, null); assert.equal(f.store.getOakWorkspace().messages.length, 0);
  assert.equal(f.requests.length, 1, 'New performs no saved write/delete');
});

test('failed reopen and stale responses after New/account switch preserve current draft and cannot restore history', async () => {
  const f = fixture(); await tick(); await f.complete(); f.store.setOakDraft('keep draft'); const before = f.store.getOakWorkspace().messages;
  f.respond(() => new Response('PRIVATE', { status: 500 })); await f.store.openOakSavedConversation(cid);
  assert.deepEqual(f.store.getOakWorkspace().messages, before); assert.equal(f.store.getOakWorkspace().draft, 'keep draft'); assert(f.store.getOakWorkspace().historyError);
  for (const invalidate of [() => f.store.startNewOakConversation(), () => f.setContext({ epoch: 2, accountVersion: 2 })]) {
    let release; f.respond(() => new Promise(resolve => { release = resolve; }));
    const opening = f.store.openOakSavedConversation(cid); await tick(); invalidate(); f.store.setOakDraft('latest account draft');
    await opening; release(Response.json(record())); await tick(); assert.equal(f.store.getOakWorkspace().savedRecord, null);
    assert.equal(f.store.getOakWorkspace().draft, 'latest account draft');
  }
});

test('private restored history clears on sign-out or account change; local save transport auth error retains completed text', async () => {
  for (const next of [{ epoch: 2, authenticated: false }, { epoch: 2, accountVersion: 2 }]) {
    const f = fixture(); await tick(); f.respond(() => Response.json(record())); await f.store.openOakSavedConversation(cid);
    f.store.setOakDraft('typed draft'); f.setContext(next); await tick();
    assert.equal(f.store.getOakWorkspace().messages.length, 0); assert.equal(f.store.getOakWorkspace().savedConversations.length, 0);
    assert.equal(f.store.getOakWorkspace().savedRecord, null); assert.equal(f.store.getOakWorkspace().draft, 'typed draft');
  }
  const f = fixture(); await tick(); await f.complete(); const before = f.store.getOakWorkspace().messages;
  f.store.setOakDraft('pending draft'); f.respond(() => new Response('EXPIRED', { status: 401 })); await f.store.saveOakCurrentConversation();
  assert.deepEqual(f.store.getOakWorkspace().messages, before); assert.equal(f.store.getOakWorkspace().draft, 'pending draft'); assert(f.store.getOakWorkspace().authReauthenticate);
});

test('deferred history read blocks explicit Send without losing the typed draft, then restores data only', async () => {
  const f = fixture(); await tick(); await f.complete();
  const id = f.store.getOakWorkspace().conversationId;
  let release; f.respond(() => new Promise(resolve => { release = resolve; }));
  const opening = f.store.openOakSavedConversation(id); await tick();
  f.store.setOakDraft('Draft edited during the read'); await f.store.submitOakTurn();
  assert.equal(f.runs.length, 1); assert.equal(f.store.getOakWorkspace().draft, 'Draft edited during the read');
  release(Response.json({ ...record(), conversationId: id })); await opening;
  assert.equal(f.runs.length, 1); assert.equal(f.store.getOakWorkspace().draft, 'Draft edited during the read');
  assert.equal(f.store.getOakWorkspace().messages[1].answer.knowledgeRevision, 'historical-knowledge');
});

test('CAS conflict reconciles lost acknowledgement once and never replaces a foreign suffix', async () => {
  for (const foreign of [false, true]) {
    const f = fixture(); await tick(); await f.complete(); let current;
    f.respond((_url, options) => { const input = JSON.parse(options.body); current = { ...record(input.messages), conversationId: input.conversationId }; return Response.json(current); });
    await f.store.saveOakCurrentConversation();
    f.respond((_url, options) => {
      if (options.method === 'PATCH') {
        const input = JSON.parse(options.body);
        current = { ...record([...current.messages, ...input.messages], 2), conversationId: current.conversationId };
        if (foreign) current = { ...current, messages: [...current.messages.slice(0, 2), ...messages(rid)], lastNewSavedMessageId: rid };
        return new Response('CONFLICT', { status: 409 });
      }
      assert.equal(options.method, 'GET'); return Response.json(current);
    });
    await f.complete('new terminal reply'); await tick();
    assert.equal(f.requests.length, 3); assert.equal(f.store.getOakWorkspace().messages.length, 4);
    assert.equal(Boolean(f.store.getOakWorkspace().saveError), foreign); assert.equal(f.store.getOakWorkspace().savedRecord.version, foreign ? 1 : 2);
  }
});

test('one append queue catches completed replies arriving during PATCH and excludes pending user rows', async () => {
  const f = fixture(); await tick(); await f.complete(); let saved, release;
  f.respond((_url, options) => { const input = JSON.parse(options.body); saved = { ...record(input.messages), conversationId: input.conversationId }; return Response.json(saved); });
  await f.store.saveOakCurrentConversation();
  let patches = 0;
  f.respond((_url, options) => {
    assert.equal(options.method, 'PATCH'); const delta = JSON.parse(options.body); patches++;
    assert.equal(delta.messages.length, 2); assert.equal(delta.expectedVersion, saved.version);
    const ack = { ...record([...saved.messages, ...delta.messages], saved.version + 1), conversationId: saved.conversationId };
    if (patches === 1) return new Promise(resolve => { release = () => { saved = ack; resolve(Response.json(saved)); }; });
    saved = ack; return Response.json(saved);
  });
  await f.complete('second question'); await tick(); assert.equal(patches, 1);
  f.store.setOakDraft('third question'); const third = f.store.submitOakTurn(); await tick(); assert.equal(patches, 1);
  assert.equal(f.store.getOakWorkspace().pending, true);
  const run = f.runs.at(-1); run.callbacks.output({ answer, cards: [], usage: null }); run.resolve(); await third;
  assert.equal(patches, 1, 'second terminal waits for the single owned PATCH');
  release(); await tick(); assert.equal(patches, 2); assert.equal(f.store.getOakWorkspace().savedRecord.messages.length, 6);
  assert.equal(f.store.getOakWorkspace().savePending, false);
});

test('stopping saved partial output appends only user plus separate immutable marker; explicit retry uses a new request UUID', async () => {
  const f = fixture(); await tick(); await f.complete(); let saved;
  f.respond((_url, options) => {
    const input = JSON.parse(options.body);
    saved = options.method === 'POST' ? { ...record(input.messages), conversationId: input.conversationId } :
      { ...record([...saved.messages, ...input.messages], saved.version + 1, [...saved.interruptedTurns, ...input.interruptedTurns]), conversationId: saved.conversationId };
    return Response.json(saved);
  });
  await f.store.saveOakCurrentConversation();
  f.store.setOakDraft('interrupted request'); const interrupted = f.store.submitOakTurn(), run = f.runs.at(-1);
  run.callbacks.output({ answer, cards: messages(rid)[1].cards, usage: null }); await tick(); assert.equal(f.requests.length, 1);
  f.store.stopOakTurn(); run.resolve(); await interrupted; await tick();
  const delta = JSON.parse(f.requests.at(-1).options.body);
  assert.equal(delta.messages.length, 1); assert.equal(delta.messages[0].role, 'user');
  assert.deepEqual(delta.interruptedTurns, [{ requestId: run.turn.requestId, state: 'interrupted', retryIntent: 'explicit-user-action-required' }]);
  assert(!JSON.stringify(delta).includes(answer.claims[0].text));
  await f.complete('explicit retry'); await tick(); assert.notEqual(f.runs.at(-1).turn.requestId, run.turn.requestId);
  assert.deepEqual(f.store.getOakWorkspace().savedRecord.interruptedTurns, delta.interruptedTurns);
});

test('New and account session changes invalidate in-flight Save acknowledgements without deleting records or drafts', async () => {
  for (const operation of ['new', 'account', 'session']) {
    const f = fixture(); await tick(); await f.complete(); let release, snapshot;
    f.respond((_url, options) => { snapshot = JSON.parse(options.body); return new Promise(resolve => { release = resolve; }); });
    const saving = f.store.saveOakCurrentConversation(); await tick();
    if (operation === 'new') f.store.startNewOakConversation(); else f.setContext({ epoch: 2, ...(operation === 'account' ? { accountVersion: 2 } : {}) });
    f.store.setOakDraft('latest draft'); await saving;
    release(Response.json({ ...record(snapshot.messages), conversationId: snapshot.conversationId })); await tick();
    assert.equal(f.store.getOakWorkspace().savedRecord, null); assert.equal(f.store.getOakWorkspace().savePending, false);
    assert.equal(f.store.getOakWorkspace().draft, 'latest draft'); assert.equal(f.requests.length, 1);
  }
});

test('history pagination is explicit and capped at50 pages, with private summaries cleared on New and session change', async () => {
  const f = fixture(); await tick(); let pages = 0;
  f.respond(() => Response.json({ conversations: [], nextCursor: `cursor_${++pages}` }));
  await f.store.loadOakSavedConversations();
  for (let i = 1; i < 51; i++) await f.store.loadOakSavedConversations(true);
  assert.equal(pages, 50); assert.equal(f.store.getOakWorkspace().historyPageCount, 50);
  assert.equal(f.requests.length, 50, 'no background pagination or unbounded loop');
  f.respond(() => Response.json({ conversations: [summary(record())], nextCursor: null })); await f.store.loadOakSavedConversations();
  assert.equal(f.store.getOakWorkspace().savedConversations.length, 1); const before = f.requests.length;
  f.setContext({ epoch: 2 }); assert.equal(f.store.getOakWorkspace().savedConversations.length, 0); assert.equal(f.requests.length, before);
  await f.store.loadOakSavedConversations(); f.store.startNewOakConversation();
  assert.equal(f.store.getOakWorkspace().savedConversations.length, 0); assert.equal(f.requests.length, before + 1);
});

const removal = (input, overrides = {}) => ({ conversationId: input.conversationId, operationId: input.operationId,
  removedAt: Date.now(), lastVersion: input.expectedVersion, reason: 'deleted', applicationHistory: 'removed', cleanup: 'complete', result: 'removed', ...overrides });

test('T15 actual lifecycle transport validates target/operation and export schema without uploading drafts', async () => {
  const f = fixture(); await tick();
  const intent = { intent: 'explicit-delete', conversationId: cid, expectedVersion: 1, operationId: crypto.randomUUID() };
  f.respond((_url, options) => Response.json(options.method === 'DELETE' ? removal(JSON.parse(options.body)) : record()));
  assert.deepEqual(await f.client.exportOakSavedConversation(cid), record()); await f.client.deleteOakSavedConversation(intent);
  assert.equal(f.requests[0].url, `/api/oak/conversations/${cid}/export`); assert.equal(f.requests[0].options.body, undefined);
  assert.equal(f.requests[1].options.method, 'DELETE'); assert.deepEqual(JSON.parse(f.requests[1].options.body), intent);
  for (const wrong of [{ operationId: crypto.randomUUID() }, { conversationId: crypto.randomUUID() }, { cleanup: 'pending' }, { private: 'canary' }]) {
    f.respond(() => Response.json(removal(intent, wrong)));
    await assert.rejects(f.client.deleteOakSavedConversation(intent), e => e.code === 'unavailable');
  }
});

test('T15 confirmed deletion is explicit and removes saved app copies/handoff while preserving exact draft', async () => {
  const f = fixture(); await tick(); await f.store.openOakSavedConversation(cid); f.store.setOakDraft('  exact unsent draft\n');
  const before = f.requests.length; f.store.beginOakSavedDeletion(summary(record()));
  assert.equal(f.requests.length, before); assert.equal(f.store.getOakWorkspace().messages.length, 2);
  f.respond((_url, options) => Response.json(removal(JSON.parse(options.body))));
  await f.store.confirmOakSavedDeletion();
  const state = f.store.getOakWorkspace(); assert.equal(f.requests.length, before + 1); assert.equal(f.requests.at(-1).options.method, 'DELETE');
  assert.equal(state.savedRecord, null); assert.equal(state.conversationId, null); assert.deepEqual(state.messages, []);
  assert.equal(state.draft, '  exact unsent draft\n'); assert.equal(state.historyRestored, false); assert.equal(state.historyLifecycle.phase, 'idle');
  assert.deepEqual(f.handoffClears, [cid]); assert.equal(f.runs.length, 0); assert.match(state.historyLifecycle.notice, /Independent copies/);
});

test('T15 unconfirmed deletion retains screen/draft, pauses sends/appends and explicit retry uses identical operation', async () => {
  const f = fixture(); await tick(); await f.store.openOakSavedConversation(cid); f.store.setOakDraft('keep this draft');
  const before = f.store.getOakWorkspace().messages;
  f.store.beginOakSavedDeletion(summary(record())); f.respond(() => new Response('PRIVATE', { status: 503 }));
  await f.store.confirmOakSavedDeletion(); const first = JSON.parse(f.requests.at(-1).options.body);
  assert.deepEqual(f.store.getOakWorkspace().messages, before); assert.equal(f.store.getOakWorkspace().draft, 'keep this draft');
  assert.equal(f.store.getOakWorkspace().historyLifecycle.phase, 'unconfirmed'); await f.store.submitOakTurn(); assert.equal(f.runs.length, 0);
  f.respond((_url, options) => Response.json(removal(JSON.parse(options.body)))); await f.store.confirmOakSavedDeletion();
  assert.deepEqual(JSON.parse(f.requests.at(-1).options.body), first); assert.equal(f.store.getOakWorkspace().messages.length, 0);
});

test('T15 repair lost-ACK conflict review canonicalizes the committed suffix before explicit deletion', async () => {
  const f = fixture(); await tick(); await f.store.openOakSavedConversation(cid);
  let committed;
  f.respond((_url, options) => {
    assert.equal(options.method, 'PATCH'); const body = JSON.parse(options.body);
    committed = record([...messages(rid), ...body.messages], 2, body.interruptedTurns);
    return new Response('ACK LOST', { status: 503 });
  });
  await f.complete('Committed second question'); await tick();
  assert.equal(committed.messages.length, 4); assert.equal(f.store.getOakWorkspace().savedRecord.version, 1);
  f.store.setOakDraft('  independent exact draft\n'); f.store.beginOakSavedDeletion(summary(record()));
  f.respond(() => new Response('CONFLICT', { status: 409 })); await f.store.confirmOakSavedDeletion();
  const original = JSON.parse(f.requests.at(-1).options.body), count = f.requests.length;
  await f.store.confirmOakSavedDeletion(); assert.equal(f.requests.length, count);
  f.respond(() => Response.json(committed)); await f.store.reviewOakSavedDeletion();
  const reviewed = f.store.getOakWorkspace(); assert.equal(reviewed.savedRecord.version, 2);
  assert.deepEqual(reviewed.savedRecord.messages, committed.messages); assert.equal(reviewed.messages.length, 4);
  assert.equal(reviewed.historyLifecycle.phase, 'confirming'); assert.notEqual(reviewed.historyLifecycle.operationId, original.operationId);
  f.respond((_url, options) => Response.json(removal(JSON.parse(options.body)))); await f.store.confirmOakSavedDeletion();
  assert.deepEqual(f.store.getOakWorkspace().messages, []); assert.equal(f.store.getOakWorkspace().conversationId, null);
  assert.equal(f.store.getOakWorkspace().draft, '  independent exact draft\n');
});

test('T15 late deletion after New/account change cannot clear a replacement conversation or draft', async () => {
  for (const action of ['new', 'account']) {
    const f = fixture(); await tick(); await f.store.openOakSavedConversation(cid); f.store.beginOakSavedDeletion(summary(record()));
    let release, input; f.respond((_url, options) => { input = JSON.parse(options.body); return new Promise(resolve => { release = resolve; }); });
    const pending = f.store.confirmOakSavedDeletion(); await tick();
    if (action === 'new') f.store.startNewOakConversation(); else f.setContext({ epoch: 2, accountVersion: 2 });
    f.store.setOakDraft('replacement draft'); release(Response.json(removal(input))); await pending;
    assert.equal(f.store.getOakWorkspace().draft, 'replacement draft'); assert.equal(f.store.getOakWorkspace().historyLifecycle.phase, 'idle');
    assert.equal(f.handoffClears.length, 0);
  }
});

test('T15 saved-copy eviction keeps unsaved later complete pairs under a fresh ID and clears ambiguous derived brief output', () => {
  const load = loader(), copies = load('src/lib/oakSavedLifecycleCopies.ts'), laterId = crypto.randomUUID();
  const base = { conversationId: cid, messages: [...messages(rid), ...messages(laterId)].map(m => ({ ...m, state: 'complete' })), savedRecord: record(),
    savedConversations: [summary(record())], historyRestored: false, historyRevision: 4, draft: 'unsent exact',
    briefDraft: { goals: 'my goals', constraints: 'constraints', startDateQuestion: '', references: answer.claims[0].citations, text: 'derived output', needsFormat: false } };
  const next = copies.removeOakSavedCopies(base, cid, record());
  assert.deepEqual(next.messages.map(m => m.id), [`${laterId}:user`, laterId]); assert.notEqual(next.conversationId, cid); assert(next.conversationId);
  assert.equal(next.savedRecord, null); assert.equal(next.historyRevision, 5); assert.equal(next.briefDraft.goals, 'my goals');
  assert.deepEqual(next.briefDraft.references, []); assert.equal(next.briefDraft.text, ''); assert.equal(next.briefDraft.needsFormat, true);
  assert.equal(next.draft, undefined, 'patch preserves the canonical draft instead of rewriting it');
  const inactive = copies.removeOakSavedCopies({ ...base, conversationId: crypto.randomUUID() }, cid, record()); assert.equal(inactive.messages, undefined);
});

test('T15 device expiry focus evicts cached saved content without claiming physical server deletion or extending retention', async () => {
  const f = fixture(); await tick(); const now = Date.now(), expired = { ...record(), createdAt: now - 31 * 86400000,
    lastSavedMessageAt: now - 30 * 86400000, updatedAt: now - 30 * 86400000, expiresAt: now };
  f.respond(() => Response.json(expired)); await f.store.openOakSavedConversation(cid); f.store.setOakDraft('draft survives');
  const count = f.requests.length; f.window.dispatchEvent(new Event('focus'));
  assert.equal(f.store.getOakWorkspace().savedRecord, null); assert.equal(f.store.getOakWorkspace().messages.length, 0);
  assert.equal(f.store.getOakWorkspace().draft, 'draft survives'); assert.equal(f.requests.length, count); assert.equal(f.runs.length, 0);
  assert.match(f.store.getOakWorkspace().historyLifecycle.notice, /on this device/);
});

test('T15 export offers only a verified JSON download, revokes its URL and suppresses late completion after Close/account change', async () => {
  const f = fixture(); await tick(); await f.store.openOakSavedConversation(cid);
  const before = f.requests.length; await f.store.exportOakSavedHistory(cid);
  assert.equal(f.requests.length, before + 1); assert.equal(f.downloads.length, 1); assert.equal(f.downloads[0].filename, `oak-conversation-${cid}.json`);
  assert.deepEqual(f.revoked, ['blob:fixture-export']); assert.match(f.store.getOakWorkspace().historyLifecycle.notice, /Download offered/);
  for (const change of ['close', 'account']) {
    const g = fixture(); await tick(); await g.store.openOakSavedConversation(cid); let release;
    g.respond(() => new Promise(resolve => { release = resolve; })); const pending = g.store.exportOakSavedHistory(cid); await tick();
    if (change === 'close') g.store.closeOakWorkspace(); else g.setContext({ epoch: 2, accountVersion: 2 });
    release(Response.json(record())); await pending; assert.equal(g.downloads.length, 0); assert.equal(g.revoked.length, 0);
  }
});

test('T15 content-free cross-tab hints invalidate matching cached history only, without network or unrelated draft loss', async () => {
  const f = fixture({ crossTab: true }); await tick(); await f.store.openOakSavedConversation(cid); f.store.setOakDraft('cross-tab draft');
  const count = f.requests.length;
  f.channels[0].onmessage({ data: { version: 1, conversationId: crypto.randomUUID() } }); assert.equal(f.store.getOakWorkspace().messages.length, 2);
  f.channels[0].onmessage({ data: { version: 1, conversationId: cid } });
  assert.equal(f.store.getOakWorkspace().messages.length, 0); assert.equal(f.store.getOakWorkspace().draft, 'cross-tab draft');
  assert.equal(f.requests.length, count); assert.equal(f.runs.length, 0); assert.match(f.store.getOakWorkspace().historyLifecycle.notice, /another tab/);
  const g = fixture({ crossTab: true }); await tick(); await g.store.openOakSavedConversation(cid); g.store.beginOakSavedDeletion(summary(record()));
  g.respond((_url, options) => Response.json(removal(JSON.parse(options.body)))); await g.store.confirmOakSavedDeletion();
  assert.deepEqual(g.channels[0].sent, [{ version: 1, conversationId: cid }]);
  assert(!JSON.stringify(g.channels[0].sent).includes('What was built?'));
});

test('T15 unavailable old Save target clears unproven retained content and association instead of reuploading it under a new ID', async () => {
  const f = fixture(); await tick(); await f.complete(); f.store.setOakDraft('keep independent draft');
  const id = f.store.getOakWorkspace().conversationId;
  f.respond(() => new Response('MISSING', { status: 404 })); await f.store.saveOakCurrentConversation();
  assert.equal(f.store.getOakWorkspace().conversationId, null); assert.deepEqual(f.store.getOakWorkspace().messages, []);
  assert.equal(f.store.getOakWorkspace().draft, 'keep independent draft'); assert.deepEqual(f.handoffClears, [id]);
  assert.match(f.store.getOakWorkspace().historyLifecycle.notice, /unavailable or expired/);
});


test('T15 repair unknown submitted append is evicted cross-tab while never-submitted later pair survives', async () => {
  const f = fixture({ crossTab: true }); await tick(); await f.store.openOakSavedConversation(cid);
  f.respond(() => new Response('ACK LOST', { status: 503 }));
  const ambiguous = await f.complete('Possibly committed question'); await tick();
  const neverSubmitted = await f.complete('Never submitted to saved history'); await tick();
  assert.equal(f.requests.filter(call => call.options.method === 'PATCH').length, 1);
  f.store.setOakDraft(' independent typed draft ');
  f.channels[0].onmessage({ data: { version: 1, conversationId: cid } });
  const state = f.store.getOakWorkspace();
  assert.deepEqual(state.messages.map(message => message.id), [`${neverSubmitted.turn.requestId}:user`, neverSubmitted.turn.requestId]);
  assert(!state.messages.some(message => message.id === ambiguous.turn.requestId));
  assert.notEqual(state.conversationId, cid); assert(state.conversationId); assert.equal(state.savedRecord, null);
  assert.equal(state.draft, ' independent typed draft ');
});

test('T15 repair active cross-tab and expiry invalidate the owned run before eviction and suppress late callbacks', async () => {
  for (const cause of ['cross-tab', 'expiry']) {
    const f = fixture({ crossTab: true }); await tick(); await f.store.openOakSavedConversation(cid);
    f.store.setOakDraft('sent input to recover'); const pending = f.store.submitOakTurn(); const run = f.runs.at(-1);
    assert(run); assert.equal(f.store.getOakWorkspace().draft, '');
    if (cause === 'cross-tab') f.store.setOakDraft('newer exact draft');
    const originalNow = Date.now;
    try {
      if (cause === 'expiry') { Date.now = () => record().expiresAt; f.window.dispatchEvent(new Event('focus')); }
      else f.channels[0].onmessage({ data: { version: 1, conversationId: cid } });
    } finally { Date.now = originalNow; }
    assert.equal(f.cancels.length, 1); assert.deepEqual(f.cancels[0], [run.turn.requestId, cid]); assert.equal(run.signal.aborted, true);
    assert.equal(f.store.getOakWorkspace().pending, false); assert.equal(f.store.getOakWorkspace().conversationId, null);
    assert.equal(f.store.getOakWorkspace().draft, cause === 'expiry' ? 'sent input to recover' : 'newer exact draft');
    run.callbacks.progress('obsolete progress', { kind: 'lookup', phase: 'running' });
    run.callbacks.output({ answer, cards: [], usage: { state: 'settled', actualMicroUsd: 123 } }); run.resolve(); await pending;
    assert.deepEqual(f.store.getOakWorkspace().messages, []); assert.equal(f.store.getOakWorkspace().progress, '');
    assert.equal(f.store.getOakWorkspace().activity, null); assert.equal(f.requests.filter(call => call.options.method === 'PATCH').length, 0);
  }
});

test('T15 repair inactive cached target invalidation does not stop unrelated active work', async () => {
  const f = fixture({ crossTab: true }), other = crypto.randomUUID(); await tick(); await f.store.openOakSavedConversation(cid);
  f.respond(() => Response.json({ conversations: [{ ...summary(record()), conversationId: other }], nextCursor: null }));
  await f.store.loadOakSavedConversations(); f.store.closeOakSavedConversations();
  f.store.setOakDraft('current conversation question'); const pending = f.store.submitOakTurn(), run = f.runs.at(-1); assert(run);
  f.channels[0].onmessage({ data: { version: 1, conversationId: other } });
  assert.equal(f.cancels.length, 0); assert.equal(run.signal.aborted, false); assert.equal(f.store.getOakWorkspace().pending, true);
  assert.equal(f.store.getOakWorkspace().conversationId, cid); assert.equal(f.store.getOakWorkspace().messages.length, 4);
  f.respond(() => new Response('not acknowledged', { status: 503 }));
  run.callbacks.output({ answer, cards: [], usage: { state: 'settled', actualMicroUsd: 123 } }); run.resolve(); await pending; await tick();
  assert.equal(f.store.getOakWorkspace().messages.at(-1).state, 'complete');
});


test('T15 repair initial Save unknown outcome tracks its target and preserves a never-submitted later pair', async () => {
  const f = fixture({ crossTab: true }); await tick(); const attempted = await f.complete('First explicit Save question');
  const target = f.store.getOakWorkspace().conversationId;
  f.respond(() => new Response('ACK LOST', { status: 503 })); await f.store.saveOakCurrentConversation();
  const ids = f.store.getOakWorkspace().savedSubmittedMessageIds;
  assert.deepEqual(ids, [`${attempted.turn.requestId}:user`, attempted.turn.requestId]);
  f.setContext({ epoch: 2 }); await tick();
  assert.deepEqual(f.store.getOakWorkspace().savedSubmittedMessageIds, ids, 'same-account session refresh retains the uncertain submitted boundary');
  const later = await f.complete('Never saved later question'); await tick();
  f.store.setOakDraft('later unsent exact'); const before = f.requests.length;
  f.channels[0].onmessage({ data: { version: 1, conversationId: target } });
  const state = f.store.getOakWorkspace(); assert.notEqual(state.conversationId, target);
  assert.deepEqual(state.messages.map(message => message.id), [`${later.turn.requestId}:user`, later.turn.requestId]);
  assert.deepEqual(state.savedSubmittedMessageIds, []); assert.equal(state.draft, 'later unsent exact');
  assert.equal(f.requests.length, before); assert.equal(f.runs.length, 2);
  f.respond(() => new Response('ACK LOST', { status: 503 })); await f.store.saveOakCurrentConversation();
  f.setContext({ epoch: 3, accountVersion: 2 }); await tick();
  assert.deepEqual(f.store.getOakWorkspace().savedSubmittedMessageIds, []); assert.deepEqual(f.store.getOakWorkspace().messages, []);
  assert.equal(f.store.getOakWorkspace().draft, 'later unsent exact');
});

const documentProof = (conversationId = cid, text = 'A private normalized saved document Ω') => {
  const operation = { conversationId, submissionId: '55555555-5555-4555-8555-555555555555', generation: 1, principalHash: 'P'.repeat(43) };
  const documentId = '66666666-6666-4666-8666-666666666666';
  const content = { documentId, slots: [0], kind: 'paste', text,
    sections: [{ id: 'section-1', start: 0, end: text.length, sourceStart: 0, sourceEnd: text.length }], offsetUnit: 'utf16',
    normalizedBytes: new TextEncoder().encode(text).byteLength, tokens: Math.ceil(text.length / 4), normalizationComplete: true,
    extractionCompleteness: 'complete', pageMapping: 'unavailable', warnings: ['no-factual-authority'], authority: 'visitor-text-only' };
  const output = { ...content, receipt: { payload: { ...operation, version: 1, expiresAt: Date.now() + 60_000, documentId, slots: [0],
    contentDigest: 'a'.repeat(64), provenance: { kind: 'preflight', parents: [{ slot: 0, receiptId: '1'.repeat(64) }] },
    parserRevision: 't18-reviewed-v2', processorRevision: 'local-text-v1' }, signature: 'b'.repeat(64) } };
  return { operation, outputs: [output], selections: [], durable: { documents: [{ ...content, label: 'Document 1',
    parserRevision: 't18-reviewed-v2', processorRevision: 'local-text-v1' }], selections: [] } };
};

const reopenedDocumentProof = (proof, selections = proof.selections) => {
  const operation = { ...proof.operation, submissionId: '77777777-7777-4777-8777-777777777777' };
  return { operation, selections, outputs: proof.outputs.map(output => ({ ...output, receipt: { ...output.receipt,
    payload: { ...output.receipt.payload, ...operation, provenance: { kind: 'saved-content', documentsDigest: 'd'.repeat(64) } } } })) };
};

test('T18 separate explicit document-inclusive transport sends one signed text copy and strips client principal assertions', async () => {
  const f = fixture(), proof = documentProof(), saved = { ...record(), documents: proof.durable };
  f.respond(() => Response.json(saved));
  await f.client.saveOakConversationWithDocuments({ intent: 'explicit-save', conversationId: cid, messages: messages(rid) }, proof);
  const request = f.requests.at(-1), body = JSON.parse(request.options.body);
  assert.equal(request.options.headers['x-oak-save-documents'], cid);
  assert.equal(body.history.documents, undefined); assert.equal(body.proof.operation.principalHash, undefined);
  assert.deepEqual(body.proof.outputs, proof.outputs); assert.equal(body.history.intent, 'explicit-save');
  await f.client.replaceOakSavedDocuments(cid, 1, proof);
  assert.equal(JSON.parse(f.requests.at(-1).options.body).history.intent, 'explicit-document-replace');
  f.respond(() => Response.json(reopenedDocumentProof(proof)));
  const fresh = await f.client.reopenOakSavedDocuments(cid);
  assert.equal(f.requests.at(-1).url, `/api/oak/conversations/${cid}/documents/reopen`);
  assert.equal(fresh.outputs[0].text, proof.outputs[0].text);
  assert.deepEqual(fresh.outputs[0].receipt.payload.provenance, { kind: 'saved-content', documentsDigest: 'd'.repeat(64) });
});

test('T18 saved reopen rejects original intake proof, malformed saved digest and mixed saved versions', async () => {
  const f = fixture(), proof = documentProof(), valid = reopenedDocumentProof(proof);
  for (const response of [ { operation: proof.operation, outputs: proof.outputs, selections: [] },
    (() => { const bad = structuredClone(valid); bad.outputs[0].receipt.payload.provenance.documentsDigest = 'invalid'; return bad; })(),
    (() => { const bad = structuredClone(valid), other = structuredClone(bad.outputs[0]);
      other.documentId = '88888888-8888-4888-8888-888888888888'; other.slots = [1];
      other.receipt.payload.documentId = other.documentId; other.receipt.payload.slots = [1];
      other.receipt.payload.provenance.documentsDigest = 'e'.repeat(64); bad.outputs.push(other); return bad; })() ]) {
    f.respond(() => Response.json(response));
    await assert.rejects(() => f.client.reopenOakSavedDocuments(cid), error => error.code === 'unavailable');
  }
});

test('T18 ordinary explicit Save excludes prepared documents; separate document Save replaces only the acknowledged set', async () => {
  const f = fixture(); await f.complete(); const currentId = f.store.getOakWorkspace().conversationId, proof = documentProof(currentId);
  f.documents.installFreshOwned({ operation: proof.operation, outputs: proof.outputs, selections: [] }, { conversationId: currentId, accountEpoch: 1 });
  f.respond((_url, options) => { const body = JSON.parse(options.body);
    return Response.json({ ...record(body.messages), conversationId: body.conversationId }); });
  await f.store.saveOakCurrentConversation();
  assert.equal(JSON.parse(f.requests.at(-1).options.body).documents, undefined);
  assert.equal(f.store.getOakWorkspace().savedRecord.documents, undefined);
  const initial = f.store.getOakWorkspace().savedRecord;
  f.respond(() => Response.json({ ...initial, version: initial.version + 1, documents: proof.durable }));
  await f.store.saveOakCurrentConversationWithDocuments();
  assert.deepEqual(f.store.getOakWorkspace().savedRecord.documents, proof.durable);
  assert.equal(f.store.getOakWorkspace().savedRecord.expiresAt, initial.expiresAt);
  assert.equal(f.documents.turnContext(), null, 'Save is not permission to read');
});

test('T18 saved reopen restores genuine fresh references, requires explicit Use, and clears text on identity change', async () => {
  const f = fixture(), proof = documentProof(), saved = { ...record(), documents: proof.durable };
  const section = { documentId: proof.outputs[0].documentId, sectionId: 'section-1', start: 0, end: proof.outputs[0].text.length };
  saved.documents.selections = [section];
  f.respond(url => Response.json(url.endsWith('/documents/reopen') ? reopenedDocumentProof(proof, [section])
    : url.endsWith('/auth/status') ? f.status : saved));
  await tick();
  await f.store.openOakSavedConversation(cid);
  assert.equal(f.documents.snapshot().documents[0].text, proof.outputs[0].text);
  assert.equal(f.documents.turnContext(), null); assert.equal(f.documents.snapshot().restored, false);
  assert.equal(f.documents.selectForTurn(), true); assert.equal(f.documents.turnContext().outputs[0].receipt.signature, proof.outputs[0].receipt.signature);
  f.setContext({ authenticated: false, epoch: 2 });
  assert.equal(f.documents.snapshot().documents.length, 0); assert.equal(f.documents.turnContext(), null);
});

test('T18 selected-document Send marks both transcript sides; explicit Save preserves provenance without letting prior text enter ordinary turns', async () => {
  const f = fixture(); await f.complete('An ordinary earlier question.');
  const currentId = f.store.getOakWorkspace().conversationId, proof = documentProof(currentId), doc = proof.outputs[0];
  f.documents.installFreshOwned({ operation: proof.operation, outputs: proof.outputs, selections: [{ documentId: doc.documentId,
    sectionId: 'section-1', start: 0, end: doc.text.length }] }, { conversationId: currentId, accountEpoch: 1 });
  assert.equal(f.documents.selectForTurn(), true);
  const privateRun = await f.complete('PRIVATE_ASSOCIATED_USER_INTENT');
  const privatePair = f.store.getOakWorkspace().messages.filter(message => message.id === privateRun.turn.requestId || message.id === `${privateRun.turn.requestId}:user`);
  assert.equal(privatePair.length, 2); assert(privatePair.every(message => message.privateDocumentTurn === true));
  f.respond((_url, options) => { const body = JSON.parse(options.body); return Response.json({ ...record(body.messages), conversationId: body.conversationId }); });
  await f.store.saveOakCurrentConversation();
  const uploaded = JSON.parse(f.requests.at(-1).options.body);
  assert(uploaded.messages.filter(message => message.id.startsWith(privateRun.turn.requestId)).every(message => message.privateDocumentTurn === true));
  f.documents.clearUse();
  const ordinary = await f.complete('A new ordinary public question.');
  assert(!JSON.stringify(ordinary.turn.messages).includes('PRIVATE_ASSOCIATED_USER_INTENT'));
  assert.equal(ordinary.turn.messages.length, 2, 'the ordinary earlier pair remains, the marked private pair is excluded');
});

test('T18 reopening saved private provenance excludes user and answer from later ordinary model/search context, including legacy unmarked document answers', async () => {
  for (const marked of [true, false]) {
    const f = fixture(), proof = documentProof(), doc = proof.outputs[0], start = 3, end = 19;
    const privateAnswer = { schema: 'oak.answer.v1', speaker: 'oak-ai-host', characterVersion: 'historical-character', hardPolicyVersion: 'historical-policy',
      knowledgeRevision: 'historical-knowledge', operations: ['read'], kind: 'document',
      claims: [{ id: 'document-claim-1', quote: doc.text.slice(start, end), citation: { sourceId: `visitor-document:${doc.documentId}:section-1:0-${doc.text.length}`,
        label: 'Document 1', sectionId: 'section-1', start, end, offsetUnit: 'utf16', authority: 'visitor-text-only' } }],
      coverage: { scope: 'selected-spans-only', offsetUnit: 'utf16', includedUtf16: doc.text.length, availableUtf16: doc.text.length,
        omittedUtf16: 0, quotedUtf16: end - start, extractionCompleteness: 'complete' } };
    const rows = messages(rid).map(message => ({ ...message, ...(marked ? { privateDocumentTurn: true } : {}),
      ...(message.role === 'user' ? { text: 'PRIVATE_RESTORED_USER_INTENT' } : { answer: privateAnswer,
        text: "", cards: [], research: null }) }));
    // Render using the same canonical parser instead of a hand-written quote format.
    const load = loader({ react: { useSyncExternalStore() {} } });
    rows[1].text = load('packages/oak-agent-contracts/src/output.ts').renderOakAnswer(privateAnswer);
    const saved = { ...record(rows), documents: proof.durable };
    f.respond(url => Response.json(url.endsWith('/documents/reopen') ? reopenedDocumentProof(proof)
      : url.endsWith('/auth/status') ? f.status : saved));
    await tick(); await f.store.openOakSavedConversation(cid);
    assert.equal(f.store.getOakWorkspace().messages[0].text, 'PRIVATE_RESTORED_USER_INTENT');
    if (marked) assert(f.store.getOakWorkspace().messages.every(message => message.privateDocumentTurn));
    f.respond((_url, options) => { const body = JSON.parse(options.body); return Response.json({ ...saved, version: 2,
      messages: [...saved.messages, ...body.messages], lastNewSavedMessageId: body.messages.at(-1).id }); });
    const ordinary = await f.complete('Explain a public portfolio project.');
    assert.deepEqual(ordinary.turn.messages, []);
    assert(!JSON.stringify(ordinary.turn).includes('PRIVATE_RESTORED_USER_INTENT'));
    assert(!JSON.stringify(ordinary.turn).includes(doc.text.slice(start, end)));
  }
});

test('T18 explicitly selected document Tools Compare keeps bounded source references, avoids text copies, and blocks Send after selection changes', async () => {
  const f = fixture(); await f.complete(); const currentId = f.store.getOakWorkspace().conversationId;
  const text = 'PRIVATE_DOCUMENT_ROLE_TEXT ' + 'r'.repeat(6000), proof = documentProof(currentId, text), doc = proof.outputs[0];
  const selection = { documentId: doc.documentId, sectionId: 'section-1', start: 0, end: text.length };
  f.documents.installFreshOwned({ operation: proof.operation, outputs: proof.outputs, selections: [selection] }, { conversationId: currentId, accountEpoch: 1 });
  assert.equal(f.documents.selectForTurn(), true); const before = f.runs.length;
  f.store.beginOakRoleDraft();
  const draft = f.store.getOakWorkspace().roleDraft;
  assert.equal(draft.roleDescription, ''); assert.equal(f.store.getOakWorkspace().draft, '');
  assert.equal(draft.requirementSource.kind, 'document'); assert.equal(draft.requirementSource.sourceIds.length, 1);
  assert.equal(f.runs.length, before, 'Tools Compare does not Send'); assert.equal(f.store.getOakResearchNeed(), null);
  assert(!JSON.stringify(draft).includes(text));
  f.documents.setSelections([{ ...selection, end: 100 }]); assert.equal(f.documents.selectForTurn(), true);
  await f.store.submitOakTurn(); assert.equal(f.runs.length, before); assert.match(f.store.getOakWorkspace().error, /selected role text changed/);
  assert.deepEqual(f.store.getOakWorkspace().roleDraft, draft); assert.equal(f.documents.snapshot().documents[0].text, text);
  f.documents.setSelections([selection]); assert.equal(f.documents.selectForTurn(), true);
  const pending = f.store.submitOakTurn(), run = f.runs.at(-1);
  assert.equal(run.turn.task.kind, 'role-fit'); assert.deepEqual(run.turn.task.requirementSource, draft.requirementSource);
  assert.equal(run.turn.task.roleDescription, undefined); assert(!JSON.stringify(run.turn.task).includes(text)); assert.equal(run.turn.publicResearch, undefined);
  run.callbacks.output({ answer, cards: [], research: null, usage: { state: 'settled', actualMicroUsd: 0 } }); run.resolve(); await pending;
});

const savedContracts = loadTsx('packages/oak-agent-contracts/src/saved-conversations.ts');
const savedOutput = loadTsx('packages/oak-agent-contracts/src/output.ts');
const corpusEntry = id => JSON.parse(readFileSync(new URL('./premium/saved-history-corpus/stored-programs.json', import.meta.url), 'utf8')).find(entry => entry.id === id);
const storedTurn = id => corpusEntry(id).record.messages;
const answerKind = id => storedTurn(id)[1].answer.kind;
const firstClaimOnly = ([, assistant]) => `root = Answer([p, src])\np = Prose("${assistant.answer.claims[0].id}")\nsrc = Sources()`;
const withProgram = ([user, assistant], program) => [user, { ...assistant, ui: { ...assistant.ui, program } }];
const saveRequest = rows => ({ intent: 'explicit-save', conversationId: cid, messages: rows });
const projectRows = (f, rows) => f.client.projectOakSavedHistory({ ...f.store.getOakWorkspace(), conversationId: cid,
  messages: rows.map(row => ({ ...row, state: 'complete' })) });
const stalePartial = 'root = Answer([eco, src])\neco = Project(["claim-1", "claim-2"])\nsrc = Sources()';

test('a chat holding a laid-out gap answer projects to a save request that keeps the layout', () => {
  const f = fixture(); const rows = storedTurn('answer-openui-source-gap');
  const projected = projectRows(f, rows);
  assert.ok(projected, 'the chat is saved, not silently dropped');
  assert.equal(projected.messages[1].answer.kind, 'gap');
  assert.deepEqual(projected.messages[1].ui, rows[1].ui);
  const partial = projectRows(f, storedTurn('answer-openui-partial-cards'));
  assert.ok(partial, 'a partial gap answer with several claims saves too');
  assert.equal(partial.messages[1].ui.program, storedTurn('answer-openui-partial-cards')[1].ui.program);
});

test('a gap answer whose layout does not cover its claims is still refused on write', () => {
  const f = fixture(); const rows = withProgram(storedTurn('answer-openui-partial-cards'), stalePartial);
  assert.equal(projectRows(f, rows), null);
  assert.equal(savedContracts.parseSaveConversationRequest(saveRequest(rows)), null);
  assert.equal(savedContracts.parseAppendSavedConversationRequest({ conversationId: cid, expectedVersion: 1, messages: rows }), null);
  const [user, assistant] = storedTurn('answer-openui-source-gap');
  assert.equal(savedContracts.parseSaveConversationRequest(saveRequest([user, { ...assistant, ui: { ...assistant.ui, requestId: rid } }])), null, 'a layout of another turn');
});

test('a gap answer with no claims refuses a layout that only lists sources', () => {
  const [user, assistant] = storedTurn('answer-openui-source-gap');
  const { claims: _claims, ...identity } = assistant.answer;
  const scopeDecline = { ...identity, kind: 'gap', claims: [], acknowledgment: 'The case studies I read do not cover that.' };
  const plain = { ...assistant, answer: scopeDecline, text: savedOutput.renderOakAnswer(scopeDecline), ui: undefined };
  const sourcesOnly = { ...plain, ui: { ...assistant.ui, program: 'root = Answer([src])\nsrc = Sources()' } };
  assert.ok(savedContracts.parseSaveConversationRequest(saveRequest([user, plain])), 'the claimless gap saves as plain text');
  assert.equal(savedContracts.parseSaveConversationRequest(saveRequest([user, sourcesOnly])), null);
  assert.equal(savedContracts.parseAppendSavedConversationRequest({ conversationId: cid, expectedVersion: 1, messages: [user, sourcesOnly] }), null);
  assert.equal(projectRows(fixture(), [user, sourcesOnly]), null);
});

test('a gap answer with a covering layout saves, appends, and reads back unchanged', () => {
  for (const id of ['answer-openui-partial', 'answer-openui-partial-cards', 'answer-openui-source-gap']) {
    const rows = storedTurn(id), savedAt = Date.UTC(2026, 10, 4);
    assert.equal(answerKind(id), 'gap', id);
    assert.deepEqual(savedContracts.parseSaveConversationRequest(saveRequest(rows)).messages, rows, id);
    assert.deepEqual(savedContracts.parseAppendSavedConversationRequest({ conversationId: cid, expectedVersion: 1, messages: rows }).messages, rows, id);
    const record = { conversationId: cid, version: 1, messages: rows, createdAt: savedAt, lastSavedMessageAt: savedAt, updatedAt: savedAt,
      expiresAt: savedContracts.getSavedConversationExpiry(savedAt), lastNewSavedMessageId: rows.at(-1).id };
    assert.deepEqual(savedContracts.parseSavedConversationRecord(record), record, id);
    assert.deepEqual(savedContracts.parseSavedConversationRecordForRead(record), record, id);
  }
});

test('a layout on a sourced answer behaves as before, and other answer kinds still refuse one', () => {
  const sourced = storedTurn('answer-openui-source');
  assert.equal(answerKind('answer-openui-source'), 'sourced');
  assert.deepEqual(savedContracts.parseSaveConversationRequest(saveRequest(sourced)).messages, sourced);
  const roles = storedTurn('answer-openui-roles');
  assert.equal(answerKind('answer-openui-roles'), 'sourced');
  assert.ok(roles[1].answer.claims.length > 1);
  assert.ok(savedContracts.parseSaveConversationRequest(saveRequest(roles)), 'the settled layout of a sourced answer saves');
  assert.equal(savedContracts.parseSaveConversationRequest(saveRequest(withProgram(roles, firstClaimOnly(roles)))), null, 'a sourced layout that skips a claim is refused');
  const [user, assistant] = storedTurn('answer-openui-source-gap');
  const { claims: _claims, ...identity } = assistant.answer;
  const declined = { ...identity, kind: 'declined', acknowledgment: 'That is outside what I can help with.' };
  const declinedRows = [user, { ...assistant, answer: declined, text: savedOutput.renderOakAnswer(declined) }];
  assert.equal(savedContracts.parseSaveConversationRequest(saveRequest(declinedRows)), null, 'a layout needs claims to cover');
  assert.ok(savedContracts.parseSaveConversationRequest(saveRequest([declinedRows[0], { ...declinedRows[1], ui: undefined }])), 'the same answer saves without one');
});

test('the corpus keeps its gap records as gap answers, with only the citation trim noted', () => {
  for (const id of ['answer-openui-partial', 'answer-openui-partial-cards', 'answer-openui-source-gap']) {
    const entry = corpusEntry(id);
    assert.equal(entry.record.messages[1].answer.kind, 'gap', id);
    assert.ok(!/saved as sourced/.test(entry.note ?? ''), `${id} note: ${entry.note}`);
  }
  assert.equal(corpusEntry('answer-openui-partial-cards').note, undefined);
  assert.equal(corpusEntry('answer-openui-source-gap').note, undefined);
});

// Ticket 83 (land-2): a turn failed on session expiry, the same question was asked again, and that turn needed one automatic
// re-ask. Its open-web card was re-addressed to the visible turn, but its summary still cited the replacement request's sources,
// so the saved schema's synthesis check (public-research.ts, unknown-id) refused the whole history and Save sent nothing.
test('a failed turn then a re-ask whose open-web card came through an automatic re-ask still saves, strictly', async () => {
  globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
  const workspace = loadTsx('src/lib/oakWorkspace.ts');
  const transport = loadTsx('packages/oak-agent-contracts/src/transport.ts');
  const { projectOakSavedHistory } = loadTsx('src/lib/oakSavedHistoryClient.ts');
  const { saveConversationRequestSchema } = loadTsx('packages/oak-agent-contracts/src/saved-conversations.ts');
  const web = id => ({ requestId: id, topicId: 'web', provider: 'Exa', phase: 'completed', reason: 'none', returnedSources: 2,
    sources: [1, 2].map(n => ({ sourceId: `external:${id}:${n}`, origin: 'external-web', title: `Field guide ${n}`, url: `https://guides${n}.example.org/a`,
      publishedAt: null, retrievedAt: 1760000000000, excerpt: 'A public excerpt.', contentStatus: 'read' })),
    synthesis: { sentences: [{ text: 'Both guides describe the same approach', cites: [`external:${id}:1`, `external:${id}:2`] }] } });
  const status = (id, data) => ({ type: 'data-status', data: { requestId: id, ...data }, transient: true });
  const scripts = [
    () => new Response(JSON.stringify({ error: 'sign-in-required' }), { status: 401 }),
    id => [{ type: 'start', messageId: id }, status(id, { phase: 'started' }), { type: 'error', errorText: transport.oakModelStallText }],
    id => [{ type: 'start', messageId: id }, status(id, { phase: 'started' }), { type: 'data-research', id: `${id}:research`, data: web(id) },
      { type: 'data-answer', data: answer }, { type: 'data-usage', data: { requestId: id, state: 'settled', actualMicroUsd: 450, heldMicroUsd: 0 } },
      { type: 'finish', finishReason: 'stop' }],
  ];
  const ids = [];
  globalThis.fetch = async (url, init) => {
    if (url !== '/api/oak/chat') return new Response('{}', { status: 503 });
    const id = JSON.parse(init.body).turn.requestId;
    ids.push(id);
    const parts = scripts[ids.length - 1](id);
    if (parts instanceof Response) return parts;
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({ start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(`data: ${JSON.stringify(part)}\n\n`));
      controller.close();
    } }), { headers: { 'X-Oak-Request-Id': id, 'x-vercel-ai-ui-message-stream': 'v1' } });
  };
  const question = 'What do current guides say about this?';
  workspace.setOakWorkspaceFixture({ presentation: 'human-agent', viewportSupported: true, messages: [], pending: false, error: null, draft: question });
  await workspace.submitOakTurn();
  workspace.setOakWorkspaceFixture({ ...workspace.getOakWorkspace(), pending: false, error: null, authReauthenticate: false, authError: null, draft: question });
  await workspace.submitOakTurn();
  const state = workspace.getOakWorkspace();
  assert.equal(ids.length, 3, 'the failed turn, then the re-ask and its one automatic re-ask');
  const last = state.messages.at(-1);
  assert.equal(last.state, 'complete');
  assert.ok(last.research.synthesis.sentences[0].cites.every(cite => cite.startsWith(`external:${last.id}:`)), 'the summary cites the visible turn\'s sources');
  const projected = projectOakSavedHistory({ ...state, conversationId: state.conversationId ?? cid });
  assert.ok(projected, 'the history projects instead of refusing Save');
  assert.equal(saveConversationRequestSchema.safeParse(projected).success, true);
  assert.deepEqual(projected.interruptedTurns.map(turn => turn.requestId), [ids[0]], 'one interrupted marker, for the failed turn');
  assert.deepEqual(projected.messages.at(-1).research.synthesis, last.research.synthesis, 'no field is dropped to make the parse pass');
});

// fcontact7: without X-Oak-Reads the Worker re-renders a saved contact-reason answer as the rates answer, so every
// history call that can return a saved message declares that this reader understands the reason.
test('every saved-history read and write declares the contact reason', async () => {
  const f = fixture(), ignore = () => {};
  f.respond(() => Response.json(record()));
  await f.client.readOakSavedConversation(cid).catch(ignore);
  await f.client.exportOakSavedConversation(cid).catch(ignore);
  await f.client.saveOakConversation({ intent: 'explicit-save', conversationId: cid, messages: messages(rid) }).catch(ignore);
  await f.client.appendOakSavedConversation({ conversationId: cid, expectedVersion: 1, messages: messages('33333333-3333-4333-8333-333333333333') }).catch(ignore);
  await f.client.listOakSavedConversations(null).catch(ignore);
  assert.equal(f.requests.length, 5);
  for (const { url, options } of f.requests) assert.equal(options.headers['X-Oak-Reads'], 'contact-reason', url);
});
