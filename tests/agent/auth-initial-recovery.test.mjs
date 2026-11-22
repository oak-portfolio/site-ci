import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as React from 'react';
import * as ai from 'ai';
import { renderToStaticMarkup } from 'react-dom/server';
import { createLoader, stubSets } from './design-rework/load-tsx.mjs';

const publicKey = `pk_test_${Buffer.from('unit.clerk.accounts.dev$').toString('base64')}`;
const config = { kind: 'sign-in-config', configured: true, publishableKey: publicKey };
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const requests = [], buttons = [], sdkInstances = [], scripts = [], timers = new Map(), values = new Map();
  let timerId = 0, respond = url => Promise.resolve(url.includes('recovery=') ? Response.json(config) : Response.json({ error: 'sign-in-required' }, { status: 401 }));
  const context = { window: Object.assign(new EventTarget(), { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, location: { origin: 'https://steveoak.com', pathname: '/', search: '' },
    __internal_ClerkUICtor: class {}, sessionStorage: { getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } }),
    document: Object.assign(new EventTarget(), { documentElement: { dataset: {} }, body: { dataset: { oakAgentEligible: 'true', oakMascotEligible: 'true', oakSourceIds: '[]' } },
      querySelectorAll: () => [], querySelector: () => null,
      createElement: () => ({ remove() {} }), head: { appendChild(script) { scripts.push(script); queueMicrotask(() => script.onload?.()); } } }),
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id),
    fetch: (...args) => { requests.push(args); return respond(...args); } };
  class Clerk {
    constructor(key) { this.key = key; this.session = null; this.mounts = []; sdkInstances.push(this); }
    async load() {}
    addListener() { return () => {}; }
    mountSignIn(node, options) { this.mounts.push({ node, options }); }
    unmountSignIn() {}
  }
  const load = createLoader({ use: [stubSets.workspaceStore()], jsx: 'react', globals: context, stubs: {
    react: React, ai, '@clerk/clerk-js': { Clerk },
    '@/components/ui/button': { Button(props) { buttons.push(props);
      return React.createElement('button', { type: props.type, disabled: props.disabled }, props.children); } },
    '@base-ui/react/field': { Field: {} }, '@/components/ui/Icon': { Icon: () => null } } });
  const account = load('src/lib/oakAccountClient.ts'), recovery = load('src/lib/oakSignInConfiguration.ts');
  const store = load('src/lib/oakWorkspace.ts');
  const { OakAccountContinuation } = load('src/components/agent/OakAccountContinuation.tsx');
  const render = () => { buttons.length = 0; return renderToStaticMarkup(React.createElement(OakAccountContinuation, { state: store.getOakWorkspace() })); };
  return { account, recovery, store, documents: load('src/lib/oakDocumentsWorkspace.ts'), requests, sdkInstances, scripts, timers, values, render, buttons,
    respond: callback => { respond = callback; } };
}

for (const [name, response] of [
  ['404 HTML', () => Promise.resolve(new Response('<html>Not found</html>', { status: 404, headers: { 'Content-Type': 'text/html' } }))],
  ['503 JSON', () => Promise.resolve(Response.json({ error: 'identity-unavailable' }, { status: 503 }))],
  ['invalid JSON', () => Promise.resolve(new Response('{broken', { headers: { 'Content-Type': 'application/json' } }))],
  ['transport failure', () => Promise.reject(new TypeError('Failed to fetch'))],
]) {
  test(`cold status ${name} keeps identity unknown and permits explicit Send without sign-in recovery`, async () => {
    const f = fixture(), draft = '  Exact unsent words\nwith spacing  ';
    f.respond(url => url === '/api/oak/chat' ? Promise.resolve(Response.json({ error: 'answer-unavailable' }, { status: 503 })) : response());
    f.store.requestOakWorkspace({}); f.store.setOakDraft(draft); await tick();
    let state = f.store.getOakWorkspace();
    assert.equal(state.presentation, 'human-agent'); assert.equal(state.draft, draft);
    assert.equal(state.authStatus, null); assert.equal(state.authReauthenticate, false);
    assert.equal(state.authSignInConfiguration, null); assert.equal(state.authOpen, false);
    assert.equal(state.authError, null); assert.equal(state.pending, false);
    assert.deepEqual(state.messages, []); assert.equal(state.savedRecord, null);
    assert.equal(f.render(), ''); assert.equal(f.sdkInstances.length, 0); assert.equal(f.scripts.length, 0);
    assert.equal(f.values.size, 0);
    assert.equal(f.requests.length, 1); assert.equal(f.requests[0][0], '/api/oak/auth/status');

    await f.store.submitOakTurn(); await tick();
    const chat = f.requests.filter(([url]) => url === '/api/oak/chat');
    assert.equal(chat.length, 1, 'explicit Send must reach ordinary chat transport');
    const [, options] = chat[0], { turn } = JSON.parse(options.body);
    assert.equal(turn.task.text, draft.trim()); assert.equal(turn.funding, 'sponsored');
    assert.equal(options.headers.Authorization, undefined);
    state = f.store.getOakWorkspace();
    assert.equal(state.pending, false); assert.equal(state.draft, draft.trim());
    assert.equal(state.authStatus, null); assert.equal(state.authReauthenticate, false);
    assert.equal(state.authSignInConfiguration, null); assert.equal(state.authError, null);
    assert.equal(state.authOpen, false); assert.equal(state.savedRecord, null);
    assert.match(state.error, /^The answer could not finish\./);
    assert.equal(state.messages.at(-1).state, 'failed');
    assert(state.messages.every(message => message.answer === null && message.usage === null));
    assert.equal(f.render(), ''); assert.equal(f.sdkInstances.length, 0); assert.equal(f.scripts.length, 0);
    assert.equal(f.values.size, 0);
    assert(f.requests.every(([url]) => url === '/api/oak/chat' || url.startsWith('/api/oak/auth/status?') || url === '/api/oak/auth/status'));
    assert(!f.requests.some(([url]) => url.includes('recovery=')));
  });
}

test('cold status401 with authStatus null renders actionable ordinary sign-in and retains exact draft without Send/Save', async () => {
  const f = fixture(); const draft = '  Exact unsent words\nwith spacing  ';
  f.store.requestOakWorkspace({}); f.store.setOakDraft(draft); await tick();
  let state = f.store.getOakWorkspace();
  assert.equal(state.authStatus, null); assert.equal(state.authReauthenticate, true);
  assert.deepEqual(state.authSignInConfiguration, config); assert.equal(state.draft, draft);
  assert.equal(state.messages.length, 0); assert.equal(state.savedRecord, null);
  // D66: a cold 401 loads the account SDK once to try renewing a stale cookie; nothing mounts until Sign in again.
  assert.equal(f.sdkInstances.length, 1); assert.equal(f.sdkInstances[0].mounts.length, 0);
  const html = f.render(); assert.match(html, />Sign in again<\/button>/); assert.doesNotMatch(html, /disabled|answers left|guest answers/);
  const button = f.buttons.find(item => item.children === 'Sign in again'); assert(button);
  button.onClick(); state = f.store.getOakWorkspace();
  assert.equal(state.authOpen, true); assert.equal(state.draft, draft); assert.equal(state.authStatus, null);
  assert.equal(f.values.size, 1); assert.doesNotMatch([...f.values.values()][0], /publishableKey|authStatus|allowance/);
  const cleanup = await f.account.mountOakSignIn({ isConnected: true }, state.authSignInConfiguration.publishableKey, () => assert.fail('no automatic session callback'));
  assert.equal(f.sdkInstances.length, 1); assert.equal(f.sdkInstances[0].mounts.length, 1); cleanup();
  await assert.rejects(f.account.oakAuthorizationHeaders(), error => error.code === 'sign-in-required');
  assert(f.requests.every(([url]) => url.startsWith('/api/oak/auth/status')));
  const [, options] = f.requests.find(([url]) => url.includes('recovery='));
  assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
  assert.deepEqual(options.headers, { Accept: 'application/json' });
});

test('configuration cannot create identity/counts, malformed/extra/hostile responses fail safely with a retry affordance', async () => {
  for (const bad of [{ ...config, allowance: { answers: { remaining: 99 } } }, { ...config, role: 'owner' },
    { ...config, publishableKey: `pk_test_${Buffer.from('attacker.example$').toString('base64')}` }, 'x'.repeat(1025)]) {
    const f = fixture(); f.respond(url => Promise.resolve(url.includes('recovery=') ? Response.json(bad) : Response.json({}, { status: 401 })));
    f.store.requestOakWorkspace({}); f.store.setOakDraft('Retain me exactly'); await tick();
    assert.equal(f.store.getOakWorkspace().authStatus, null); assert.equal(f.store.getOakWorkspace().authSignInConfiguration, null);
    assert.equal(f.store.getOakWorkspace().draft, 'Retain me exactly'); assert.equal(f.sdkInstances.length, 0);
    assert.match(f.render(), />Check sign-in again<\/button>/);
    assert.doesNotMatch(f.render(), /99|answers left/);
  }
});

test('recovery fetch and response body are time bounded even when transport ignores AbortSignal', async () => {
  for (const stalled of ['fetch', 'body']) {
    const f = fixture();
    f.respond(() => stalled === 'fetch' ? new Promise(() => {}) : Promise.resolve(new Response(new ReadableStream({ start() {} }),
      { headers: { 'content-type': 'application/json' } })));
    const pending = f.recovery.readOakSignInConfiguration();
    await tick(); for (const callback of [...f.timers.values()]) callback();
    await assert.rejects(pending, error => error.code === 'unavailable');
    assert.equal(f.timers.size, 0); assert.equal(f.sdkInstances.length, 0);
  }
});

test('late recovery cannot replace a newer verified current status or alter its draft', async () => {
  const f = fixture(); let release;
  f.respond(url => url.includes('recovery=') ? new Promise(resolve => { release = resolve; }) : Promise.resolve(Response.json({}, { status: 401 })));
  f.store.requestOakWorkspace({}); f.store.setOakDraft('Independent later draft'); await tick(); assert(release);
  const guest = { configured: true, kind: 'guest', phase: 'guest', role: 'visitor', publishableKey: publicKey, purpose: null,
    allowance: { answers: { limit: 6, remaining: 5, refillsAt: null }, window: { completed: 1, pending: 0, limit: 100, remaining: 99 } } };
  f.respond(() => Promise.resolve(Response.json(guest)));
  await f.store.refreshOakAuthStatus(); release(Response.json(config)); await tick();
  assert.deepEqual(f.store.getOakWorkspace().authStatus, guest);
  assert.equal(f.store.getOakWorkspace().authSignInConfiguration, null);
  assert.equal(f.store.getOakWorkspace().authReauthenticate, false);
  assert.equal(f.store.getOakWorkspace().draft, 'Independent later draft');
});

test('configuration received after an explicit account-context change is rejected rather than adopted', async () => {
  const f = fixture(); let release;
  f.respond(() => new Promise(resolve => { release = resolve; }));
  const pending = f.recovery.readOakSignInConfiguration(); await tick(); assert(release);
  const cleanup = await f.account.mountOakSignIn({ isConnected: true }, publicKey, () => {});
  f.sdkInstances[0].session = { id: 'independent-new-session', status: 'active', user: { id: 'independent-new-account' } };
  assert.equal(f.account.getOakAccountContext().authenticated, true);
  release(Response.json(config));
  await assert.rejects(pending, error => error.code === 'cancelled'); cleanup();
  assert.equal(f.requests.length, 1);
});

test('current account status failure enters recovery without showing stale counts or overriding unavailable config', async () => {
  const f = fixture();
  const known = { configured: true, kind: 'account', phase: 'ready', role: 'visitor', publishableKey: publicKey, purpose: 'exploring',
    allowance: { answers: { limit: 6, remaining: 5, refillsAt: null }, window: { completed: 1, pending: 0, limit: 100, remaining: 99 } } };
  f.respond(() => Promise.resolve(Response.json(known)));
  await f.store.refreshOakAuthStatus(); f.store.setOakDraft('Still independent');
  f.respond(url => Promise.resolve(url.includes('recovery=') ? Response.json({ kind: 'sign-in-config', configured: false, publishableKey: null }) :
    Response.json({ error: 'identity-unavailable' }, { status: 503 })));
  await f.store.refreshOakAuthStatus();
  assert.equal(f.store.getOakWorkspace().authReauthenticate, true);
  assert.deepEqual(f.store.getOakWorkspace().authStatus, known);
  assert.equal(f.store.getOakWorkspace().draft, 'Still independent');
  assert.match(f.render(), />Check sign-in again<\/button>/);
  assert.doesNotMatch(f.render(), /answers left|9 answers|29 left/);
  f.store.beginOakSignIn(); assert.equal(f.store.getOakWorkspace().authOpen, false);
  assert.equal(f.sdkInstances.length, 0);
});

test('actual workspace identity listener stages guest documents and only explicit verified Continue reissues them without Save or Send', async () => {
  const f = fixture(), conversationId = '11111111-1111-4111-8111-111111111111';
  const guest = { configured: true, kind: 'guest', phase: 'guest', role: 'visitor', publishableKey: publicKey, purpose: null,
    allowance: { answers: { limit: 6, remaining: 6, refillsAt: null }, window: { completed: 0, pending: 0, limit: 100, remaining: 100 } } };
  const account = { ...guest, kind: 'account', phase: 'continue-required', purpose: null,
    allowance: guest.allowance };
  const operation = { principalHash: 'G'.repeat(43), conversationId, submissionId: '22222222-2222-4222-8222-222222222222', generation: 1 };
  const freshOperation = { ...operation, principalHash: 'A'.repeat(43), submissionId: '55555555-5555-4555-8555-555555555555' };
  const text = 'PRIVATE_ACCOUNT_DOCUMENT_CANARY', expiresAt = Date.now() + 60_000;
  const output = { documentId: '33333333-3333-4333-8333-333333333333', slots: [0], kind: 'txt', text,
    sections: [{ id: 'section-1', start: 0, end: text.length, sourceStart: 0, sourceEnd: text.length }],
    offsetUnit: 'utf16', normalizedBytes: text.length, tokens: 8, normalizationComplete: true, extractionCompleteness: 'complete',
    pageMapping: 'unavailable', warnings: ['no-factual-authority'], authority: 'visitor-text-only',
    receipt: { payload: { ...operation, version: 1, expiresAt, documentId: '33333333-3333-4333-8333-333333333333', slots: [0],
      contentDigest: 'a'.repeat(64), provenance: { kind: 'preflight', parents: [{ slot: 0, receiptId: '1'.repeat(64) }] },
      parserRevision: 't18-reviewed-v2', processorRevision: 'local-text-v1' }, signature: 'b'.repeat(64) } };
  let signedIn = false, continued = false;
  f.respond((url, init) => {
    if (url.startsWith('/api/oak/auth/status')) return Promise.resolve(Response.json(signedIn ? { ...account, ...(continued ? { phase: 'ready', purpose: 'exploring' } : {}) } : guest));
    if (url === '/api/oak/auth/continue') { continued = true; return Promise.resolve(Response.json({ ...account, phase: 'ready', purpose: 'exploring' })); }
    if (url.includes('/reissue?')) {
      assert(continued); const body = JSON.parse(init.body);
      assert.equal(body.outputs[0].text, text);
      return Promise.resolve(Response.json({ operation: freshOperation, outputs: [{ ...output, receipt: { ...output.receipt,
        payload: { ...output.receipt.payload, ...freshOperation } } }], selections: body.selections }));
    }
    throw new Error('No Save, Send, preparation or unrelated network request is allowed');
  });
  f.store.requestOakWorkspace({});
  await f.store.refreshOakAuthStatus();
  const controller = f.documents.getOakDocumentsController();
  const spans = [{ documentId: output.documentId, sectionId: 'section-1', start: 0, end: text.length }];
  // The public entry point creates the active conversation before document preparation.
  f.store.openOakDocuments();
  const mainId = f.store.getOakWorkspace().conversationId;
  operation.conversationId = mainId; freshOperation.conversationId = mainId; output.receipt.payload.conversationId = mainId;
  controller.installFreshOwned({ operation, outputs: [output], selections: spans }, { conversationId: mainId, accountEpoch: f.account.getOakAccountContext().epoch });
  controller.selectForTurn();
  const stopOwner = f.store.installOakPresentationOwner();
  const cleanup = await f.account.mountOakSignIn({ isConnected: true }, publicKey, () => {});
  signedIn = true;
  f.sdkInstances[0].session = { id: 'continuation-session', status: 'active', user: { id: 'continuation-account' },
    getToken: async () => 'fixture.payload.signature' };
  f.account.getOakAccountContext(); await tick();
  assert.equal(controller.turnContext(), null); assert.deepEqual(controller.snapshot().documents, []);
  assert.equal(f.requests.filter(([url]) => url.includes('/reissue?')).length, 0);
  await f.store.completeOakAccount({ purpose: 'exploring' });
  assert.equal(f.requests.filter(([url]) => url.includes('/reissue?')).length, 1);
  assert.equal(controller.snapshot().documents[0].text, text); assert.equal(controller.snapshot().open, true);
  assert.equal(controller.turnContext(), null); assert.deepEqual(controller.snapshot().usedSelections, []);
  assert.equal(f.store.getOakWorkspace().messages.length, 0); assert.equal(f.store.getOakWorkspace().savedRecord, null);
  assert(![...f.values.values()].some(value => value.includes(text)));
  cleanup(); stopOwner();
});


test('caller-aborted recovery settles without identity or late configuration, including uncooperative fetch/body', async () => {
  const pre = fixture(), already = new AbortController(); already.abort();
  const preflight = pre.recovery.readOakSignInConfiguration(already.signal).catch(error => error.code);
  await tick(); for (const callback of [...pre.timers.values()]) callback();
  assert.equal(await preflight, 'cancelled'); assert.equal(pre.requests.length, 0);
  for (const stalled of ['fetch', 'body']) {
    const f = fixture(), caller = new AbortController(); let release, cancelled = 0, settled = false;
    f.respond(() => stalled === 'fetch' ? new Promise(resolve => { release = resolve; }) : Promise.resolve(new Response(
      new ReadableStream({ start() {}, cancel() { cancelled++; } }), { headers: { 'content-type': 'application/json' } })));
    const pending = f.recovery.readOakSignInConfiguration(caller.signal).catch(error => { settled = true; return error.code; });
    await tick(); caller.abort(); await tick(); const promptlySettled = settled;
    for (const callback of [...f.timers.values()]) callback();
    assert.equal(await pending, 'cancelled'); assert.equal(promptlySettled, true);
    if (release) release(new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { 'content-type': 'application/json' } }));
    await tick(); assert.equal(cancelled, 1); assert.equal(f.timers.size, 0);
    assert.equal(f.account.getOakAccountContext().authenticated, false); assert.equal(f.sdkInstances.length, 0);
  }
});


const freshGuestStatus = { configured: true, kind: 'guest', phase: 'guest', role: 'visitor', publishableKey: publicKey, purpose: null,
  allowance: { answers: { limit: 6, remaining: 6, refillsAt: null }, window: { completed: 0, pending: 0, limit: 100, remaining: 100 } } };
async function blockedGuest() {
  const f = fixture();
  f.respond(url => Promise.resolve(url.includes('recovery=') ? Response.json({ ...config, guestRecoveryAvailable: true }) : Response.json({}, { status: 401 })));
  f.store.requestOakWorkspace({}); await tick();
  return f;
}
test('explicit guest recovery clears the owned preview and local conversation before the server responds, coalesces, and sends no question', async () => {
  const f = await blockedGuest();
  f.store.setOakDraft('Abandon this draft'); f.store.openOakDocuments();
  const controller = f.documents.getOakDocumentsController(), conversationId = f.store.getOakWorkspace().conversationId;
  const text = 'PRIVATE_OLD_GUEST', documentId = '33333333-3333-4333-8333-333333333333';
  const operation = { principalHash: 'G'.repeat(43), conversationId, submissionId: '22222222-2222-4222-8222-222222222222', generation: 1 };
  const output = { documentId, slots: [0], kind: 'txt', text,
    sections: [{ id: 'section-1', start: 0, end: text.length, sourceStart: 0, sourceEnd: text.length }],
    offsetUnit: 'utf16', normalizedBytes: text.length, tokens: 8, normalizationComplete: true, extractionCompleteness: 'complete',
    pageMapping: 'unavailable', warnings: ['no-factual-authority'], authority: 'visitor-text-only',
    receipt: { payload: { ...operation, version: 1, expiresAt: Date.now() + 60000, documentId, slots: [0], contentDigest: 'a'.repeat(64),
      provenance: { kind: 'preflight', parents: [{ slot: 0, receiptId: '1'.repeat(64) }] }, parserRevision: 't18-reviewed-v2', processorRevision: 'local-text-v1' }, signature: 'b'.repeat(64) } };
  controller.installFreshOwned({ operation, outputs: [output], selections: [{ documentId, sectionId: 'section-1', start: 0, end: text.length }] },
    { conversationId, accountEpoch: f.account.getOakAccountContext().epoch });
  assert.equal(controller.selectForTurn(), true); assert(controller.turnContext());
  let release;
  f.respond((url, init) => {
    assert.equal(url, '/api/oak/auth/recover-guest'); assert.equal(init.method, 'POST'); assert.equal(init.credentials, 'same-origin');
    assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error'); assert.equal(init.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(init.body), { action: 'abandon-guest-session' });
    return new Promise(resolve => { release = resolve; });
  });
  const html = f.render(); assert.match(html, /clears the current conversation, draft and document preview/);
  const button = f.buttons.find(item => item.children === 'Start a fresh guest session'); assert(button); button.onClick(); await tick();
  let state = f.store.getOakWorkspace();
  assert.equal(state.authPending, true); assert.equal(state.conversationId, null); assert.equal(state.draft, ''); assert.deepEqual(state.messages, []);
  assert.deepEqual(controller.snapshot().documents, []); assert.deepEqual(controller.snapshot().usedSelections, []); assert.equal(controller.turnContext(), null);
  await f.store.startFreshOakGuestSession(); await f.store.refreshOakAuthStatus();
  assert.equal(f.requests.filter(([url]) => url === '/api/oak/auth/recover-guest').length, 1);
  assert(![...f.values.values()].some(value => value.includes('PRIVATE_OLD_GUEST')));
  release(Response.json(freshGuestStatus)); await tick();
  state = f.store.getOakWorkspace(); assert.deepEqual(state.authStatus, freshGuestStatus); assert.equal(state.authPending, false); assert.equal(state.authReauthenticate, false);
  assert.equal(state.savedRecord, null); assert.equal(state.conversationId, null); assert.equal(f.sdkInstances.length, 1, 'only the D66 renewal load');
  assert(f.requests.every(([url]) => url.startsWith('/api/oak/auth/')));
});

for (const change of ['new-conversation', 'close']) test(`late guest recovery cannot reopen state after ${change}`, async () => {
  const f = await blockedGuest(); let release;
  f.respond(url => url === '/api/oak/auth/recover-guest' ? new Promise(resolve => { release = resolve; }) : Promise.resolve(Response.json(freshGuestStatus)));
  const pending = f.store.startFreshOakGuestSession(); await tick();
  if (change === 'new-conversation') f.store.startNewOakConversation(); else f.store.closeOakWorkspace();
  f.store.setOakDraft('Newer exact draft'); await tick();
  const current = f.store.getOakWorkspace(); release(Response.json(freshGuestStatus)); await pending; await tick();
  assert.deepEqual(f.store.getOakWorkspace(), current); assert.equal(f.store.getOakWorkspace().authPending, false);
  assert.equal(f.documents.getOakDocumentsController().turnContext(), null);
});

test('guest recovery refuses an attempted account and rejects a response after account epoch changes', async () => {
  const f = await blockedGuest(); let release;
  f.respond(() => new Promise(resolve => { release = resolve; }));
  const pending = f.account.recoverOakGuestSession().catch(error => error.code); await tick();
  const cleanup = await f.account.mountOakSignIn({ isConnected: true }, publicKey, () => {});
  f.sdkInstances[0].session = { id: 'new-account-session', status: 'active', user: { id: 'account-owner' }, getToken: async () => 'fixture.payload.signature' };
  f.account.getOakAccountContext(); release(Response.json(freshGuestStatus));
  assert.equal(await pending, 'unavailable'); assert.equal(f.account.canRecoverOakGuestSession(), false);
  const before = f.requests.length;
  await assert.rejects(f.account.recoverOakGuestSession(), error => error.code === 'sign-in-required');
  assert.equal(f.requests.length, before); assert.doesNotMatch(f.render(), /Start a fresh guest session/); cleanup();
});

test('guest recovery deadline or invalid response keeps cleared authority blocked and requires explicit retry', async () => {
  for (const kind of ['hung', 'invalid']) {
    const f = await blockedGuest(); f.store.setOakDraft('Explicitly abandoned');
    f.respond(() => kind === 'hung' ? new Promise(() => {}) : Promise.resolve(Response.json({ ...freshGuestStatus, kind: 'account', phase: 'ready' })));
    const pending = f.store.startFreshOakGuestSession(); await tick();
    if (kind === 'hung') for (const timer of [...f.timers.values()]) timer();
    await pending;
    const state = f.store.getOakWorkspace(); assert.equal(state.authPending, false); assert.equal(state.authStatus, null); assert.equal(state.authReauthenticate, true);
    assert.equal(state.draft, ''); assert.equal(state.conversationId, null); assert.match(state.authError, /previous conversation and document preview were cleared/);
    assert.equal(f.requests.filter(([url]) => url === '/api/oak/auth/recover-guest').length, 1); assert.equal(f.account.getOakAccountContext().authenticated, false);
  }
});

async function idleAccount(revoked = false, wrap = response => response) {
  const f = fixture(), stale = 'stale.payload.signature', renewed = 'fresh.payload.signature';
  const status = { configured: true, kind: 'account', phase: 'ready', role: 'visitor', publishableKey: publicKey, purpose: 'exploring',
    allowance: { answers: { limit: 6, remaining: 6, refillsAt: null }, window: { completed: 0, pending: 0, limit: 100, remaining: 100 } } };
  const answer = { schema: 'oak.answer.v1', speaker: 'oak-ai-host', characterVersion: 'fixture', hardPolicyVersion: 'fixture', knowledgeRevision: 'fixture',
    operations: ['search', 'read'], kind: 'sourced', acknowledgment: null, claims: [{ id: 'ownership', text: 'Steve owned the app around the classifier.',
      citations: [{ documentId: 'work:ecosmartloop', passageId: 'public-passage', sectionId: 'ownership', url: 'https://steveoak.com/work/ecosmartloop/#ownership' }] }] };
  const handler = (url, init) => {
    if (url.startsWith('/api/oak/auth/status')) return Promise.resolve(revoked && f.requests.some(([seen]) => seen === '/api/oak/chat') ?
      Response.json({ error: 'invalid-session' }, { status: 401 }) : Response.json(status));
    if (url !== '/api/oak/chat') return Promise.resolve(Response.json(config));
    if (init.headers.Authorization !== `Bearer ${renewed}`) return Promise.resolve(Response.json({ error: 'invalid-session' }, { status: 401 }));
    const { turn } = JSON.parse(init.body), encoder = new TextEncoder();
    const parts = [{ type: 'start', messageId: turn.requestId }, { type: 'data-answer', id: 'answer', data: answer },
      { type: 'data-usage', data: { requestId: turn.requestId, state: 'settled', actualMicroUsd: 450, heldMicroUsd: 0 } }, { type: 'finish', finishReason: 'stop' }];
    return Promise.resolve(new Response(new ReadableStream({ start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(`data: ${JSON.stringify(part)}\n\n`)); controller.close();
    } }), { headers: { 'X-Oak-Request-Id': turn.requestId, 'x-vercel-ai-ui-message-stream': 'v1' } }));
  };
  f.respond((url, init) => handler(url, init).then(wrap));
  f.store.requestOakWorkspace({});
  const cleanup = await f.account.mountOakSignIn({ isConnected: true }, publicKey, () => {});
  f.sdkInstances[0].session = { id: 'idle-session', status: 'active', user: { id: 'idle-account' },
    getToken: async options => {
      if (!options?.skipCache) return stale;
      if (revoked) throw new Error('session revoked');
      return renewed;
    } };
  f.account.getOakAccountContext();
  await f.store.refreshOakAuthStatus(); await tick();
  return { f, cleanup };
}

test('195 the first send after a long idle refreshes an expired token once and answers without the sign-in notice', async () => {
  const { f, cleanup } = await idleAccount();
  f.store.setOakDraft('What did Steve own?');
  await f.store.submitOakTurn(); await tick();
  const chat = f.requests.filter(([url]) => url === '/api/oak/chat');
  assert.deepEqual(chat.map(([, init]) => init.headers.Authorization), ['Bearer stale.payload.signature', 'Bearer fresh.payload.signature']);
  const state = f.store.getOakWorkspace();
  assert.equal(state.error, null); assert.equal(state.authReauthenticate, false);
  assert.equal(state.messages.at(-1).state, 'complete'); assert.equal(state.messages.at(-1).answer.kind, 'sourced');
  assert.doesNotMatch(f.render(), /Sign in again/);
  cleanup();
});

test('195 a revoked session still shows the sign-in notice and keeps the draft after one refresh attempt', async () => {
  const { f, cleanup } = await idleAccount(true);
  const draft = 'What did Steve own?';
  f.store.setOakDraft(draft);
  await f.store.submitOakTurn(); await tick();
  assert.equal(f.requests.filter(([url]) => url === '/api/oak/chat').length, 1);
  const state = f.store.getOakWorkspace();
  assert.equal(state.authReauthenticate, true); assert.match(state.error, /^Sign in again to continue\./);
  assert.equal(state.draft, draft); assert.equal(state.messages.at(-1).state, 'failed');
  cleanup();
});

test('205 a revoked session offers no Retry on its failed turn, since only signing in again can succeed', async () => {
  const { f, cleanup } = await idleAccount(true);
  f.store.setOakDraft('What did Steve own?');
  await f.store.submitOakTurn(); await tick();
  const state = f.store.getOakWorkspace();
  assert.equal(state.authReauthenticate, true); assert.equal(state.messages.at(-1).state, 'failed');
  assert.equal(f.store.oakRetryKind(state, state.messages.at(-1).id), null);
  cleanup();
});

for (const failure of ['throws', 'times out']) test(`195 a cached token that ${failure} gets one fresh token and answers without the notice`, async () => {
  const { f, cleanup } = await idleAccount();
  let cached = null;
  f.sdkInstances[0].session.getToken = async options => {
    if (options?.skipCache) return cached = 'fresh.payload.signature';
    if (cached) return cached;
    if (failure === 'throws') throw new Error('token unavailable');
    return new Promise(() => {});
  };
  f.store.setOakDraft('What did Steve own?');
  const pending = f.store.submitOakTurn();
  if (failure === 'times out') { await tick(); for (const [id, timer] of [...f.timers]) { f.timers.delete(id); timer(); } }
  await pending; await tick();
  const chat = f.requests.filter(([url]) => url === '/api/oak/chat');
  assert.deepEqual(chat.map(([, init]) => init.headers.Authorization), ['Bearer fresh.payload.signature']);
  const state = f.store.getOakWorkspace();
  assert.equal(state.error, null); assert.equal(state.authReauthenticate, false);
  assert.equal(state.messages.at(-1).state, 'complete'); assert.doesNotMatch(f.render(), /Sign in again/);
  cleanup();
});

test('195 a signed-out 401 sends one request and shows its notice', async () => {
  const f = fixture();
  f.respond(url => Promise.resolve(url === '/api/oak/chat' ? Response.json({ error: 'invalid-session' }, { status: 401 }) : Response.json(config)));
  f.store.requestOakWorkspace({}); f.store.setOakDraft('What did Steve own?'); await tick();
  await f.store.submitOakTurn(); await tick();
  const chat = f.requests.filter(([url]) => url === '/api/oak/chat');
  assert.equal(chat.length, 1); assert.equal(chat[0][1].headers.Authorization, undefined);
  const state = f.store.getOakWorkspace();
  assert.match(state.error, /^Sign in again to continue\./); assert.equal(state.messages.at(-1).state, 'failed');
  assert.equal(f.sdkInstances.length, 0);
});

function countFreshTokens(f) {
  const session = f.sdkInstances[0].session, getToken = session.getToken, fresh = [];
  session.getToken = options => { if (options?.skipCache) fresh.push(options); return getToken(options); };
  return fresh;
}

test('195 a Stop during the first send does not retry', async () => {
  const { f, cleanup } = await idleAccount(), fresh = countFreshTokens(f);
  f.respond((url, init) => {
    if (url !== '/api/oak/chat') return Promise.resolve(Response.json(url.startsWith('/api/oak/cancel') ? {} : config));
    setImmediate(() => f.store.stopOakTurn());
    return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  });
  f.store.setOakDraft('What did Steve own?');
  await f.store.submitOakTurn(); await tick(); await tick();
  assert.equal(f.requests.filter(([url]) => url === '/api/oak/chat').length, 1); assert.equal(fresh.length, 0);
  cleanup();
});

test('195 a Stop right after a 401 fetches no fresh token and sends nothing more', async () => {
  const { f, cleanup } = await idleAccount(), fresh = countFreshTokens(f);
  f.respond(url => {
    if (url !== '/api/oak/chat') return Promise.resolve(Response.json(url.startsWith('/api/oak/cancel') ? {} : config));
    f.store.stopOakTurn();
    return Promise.resolve(Response.json({ error: 'invalid-session' }, { status: 401 }));
  });
  f.store.setOakDraft('What did Steve own?');
  await f.store.submitOakTurn(); await tick(); await tick();
  assert.equal(f.requests.filter(([url]) => url === '/api/oak/chat').length, 1); assert.equal(fresh.length, 0);
  cleanup();
});

for (const code of ['funding-reconnect-required', 'sign-in-required', 'funding-provider-unavailable']) test(`195 a signed-in 401 ${code} is not retried`, async () => {
  const { f, cleanup } = await idleAccount(), fresh = countFreshTokens(f);
  f.respond(url => Promise.resolve(url === '/api/oak/chat' ? Response.json({ error: code }, { status: 401 }) : Response.json(config)));
  f.store.setOakDraft('What did Steve own?');
  await f.store.submitOakTurn(); await tick();
  const chat = f.requests.filter(([url]) => url === '/api/oak/chat');
  assert.deepEqual(chat.map(([, init]) => init.headers.Authorization), ['Bearer stale.payload.signature']); assert.equal(fresh.length, 0);
  assert.equal(f.store.getOakWorkspace().messages.at(-1).state, 'failed');
  cleanup();
});

test('198 a signed-in 401 invalid-guest-session sends once and shows the same sign-in notice as invalid-session, keeping the draft', async () => {
  const { f, cleanup } = await idleAccount(), fresh = countFreshTokens(f), draft = 'What did Steve own?';
  f.respond(url => Promise.resolve(url === '/api/oak/chat' ? Response.json({ error: 'invalid-guest-session' }, { status: 401 }) : Response.json(config)));
  f.store.setOakDraft(draft);
  await f.store.submitOakTurn(); await tick();
  assert.equal(f.requests.filter(([url]) => url === '/api/oak/chat').length, 1); assert.equal(fresh.length, 0);
  const state = f.store.getOakWorkspace();
  assert.equal(state.authReauthenticate, true); assert.match(state.error, /^Sign in again to continue\./);
  assert.equal(state.draft, draft); assert.equal(state.messages.at(-1).state, 'failed');
  cleanup();
});

test('198 the retried invalid-session 401 is read once and never cancelled after its body was read', async () => {
  const cancels = [];
  const { f, cleanup } = await idleAccount(false, response => {
    if (response.status !== 401) return response;
    const body = response.body, cancel = body.cancel.bind(body);
    body.cancel = reason => { cancels.push(response.bodyUsed); return cancel(reason); };
    return response;
  });
  f.store.setOakDraft('What did Steve own?');
  await f.store.submitOakTurn(); await tick();
  assert.equal(f.requests.filter(([url]) => url === '/api/oak/chat').length, 2);
  assert.equal(f.store.getOakWorkspace().messages.at(-1).state, 'complete');
  assert.deepEqual(cancels, [], 'the retry branch cancels no body it already read');
  cleanup();
});

async function idleMint(mint) {
  const { f, cleanup } = await idleAccount(), clerk = f.sdkInstances[0];
  let calls = 0;
  clerk.session.getToken = options => mint(++calls, clerk, options);
  f.store.setOakDraft('What did Steve own?');
  const pending = f.store.submitOakTurn();
  let settled = false; void pending.finally(() => { settled = true; });
  for (let round = 0; round < 6 && !settled; round++) { await tick(); for (const [id, timer] of [...f.timers]) { f.timers.delete(id); timer(); } }
  await pending; await tick();
  return { f, cleanup, calls: () => calls, state: f.store.getOakWorkspace() };
}
const swapSession = clerk => { clerk.session = { ...clerk.session }; };

test('d195 a Clerk session swap during the first token mint is rescued by the 195 retry', async () => {
  const { f, cleanup, calls, state } = await idleMint(async (call, clerk) => { if (call === 1) swapSession(clerk); return 'fresh.payload.signature'; });
  assert(calls() >= 2); assert.equal(state.messages.at(-1).state, 'complete'); assert.doesNotMatch(f.render(), /Sign in again/);
  cleanup();
});

test('d195 a Clerk session swap during every token mint still answers without the sign-in notice', async () => {
  const { f, cleanup, state } = await idleMint(async (_, clerk) => { swapSession(clerk); return 'fresh.payload.signature'; });
  assert.equal(state.authReauthenticate, false, 'same session id, only a new Session object');
  assert.equal(state.messages.at(-1).state, 'complete'); assert.doesNotMatch(f.render(), /Sign in again/);
  cleanup();
});

test('d195 a token mint past the 5 s bound on both attempts with a live session does not ask to sign in again', async () => {
  const { f, cleanup, calls, state } = await idleMint(() => new Promise(() => {}));
  assert(calls() >= 2);
  assert.equal(state.authReauthenticate, false, 'the session is still active; only the token wait timed out');
  assert.doesNotMatch(state.error ?? '', /Sign in again/);
  assert.match(state.error, /^The answer could not finish\./); assert.equal(state.draft, 'What did Steve own?');
  // r202 M1: the status re-check after the failed send times out the same way; it must not turn into "Sign in again".
  for (let round = 0; round < 3; round++) { await tick(); for (const [id, timer] of [...f.timers]) { f.timers.delete(id); timer(); } await tick(); }
  const after = f.store.getOakWorkspace();
  assert.equal(after.authReauthenticate, false); assert.equal(after.authStatus?.kind, 'account');
  assert.doesNotMatch(f.render(), /Sign in again/); assert.equal(after.draft, 'What did Steve own?');
  cleanup();
});

test('202 a session that ends during a slow token mint still shows the sign-in notice and keeps the draft', async () => {
  const { f, cleanup, state } = await idleMint((_, clerk) => { clerk.session = { ...clerk.session, status: 'ended' }; return new Promise(() => {}); });
  assert.equal(f.requests.filter(([url]) => url === '/api/oak/chat').length, 0);
  assert.equal(state.authReauthenticate, true); assert.match(state.error, /^Sign in again to continue\./);
  assert.equal(state.draft, 'What did Steve own?'); assert.equal(state.messages.at(-1).state, 'failed');
  cleanup();
});

async function continueWith(mint) {
  const { f, cleanup } = await idleAccount(), clerk = f.sdkInstances[0];
  clerk.session.getToken = options => mint(clerk, options);
  f.store.setOakDraft('What did Steve own?');
  f.store.beginOakSignIn();
  for (let round = 0; round < 6 && f.store.getOakWorkspace().authPending; round++) { await tick(); for (const [id, timer] of [...f.timers]) { f.timers.delete(id); timer(); } }
  await tick();
  return { f, cleanup, state: f.store.getOakWorkspace() };
}

test('204 Continue on a live session whose token wait times out shows the ordinary retry notice, not sign in again', async () => {
  const { cleanup, state } = await continueWith(() => new Promise(() => {}));
  assert.equal(state.authPending, false); assert.equal(state.authReauthenticate, false);
  assert.doesNotMatch(state.authError ?? '', /Sign in again/);
  assert.match(state.authError, /^Sign-in could not be checked\./); assert.equal(state.draft, 'What did Steve own?');
  cleanup();
});

test('204 Continue on a revoked session still asks to sign in again', async () => {
  const { cleanup, state } = await continueWith(async () => { throw new Error('session revoked'); });
  assert.equal(state.authPending, false); assert.equal(state.authReauthenticate, true);
  assert.match(state.authError, /^Sign in again to continue\./); assert.equal(state.draft, 'What did Steve own?');
  cleanup();
});

test('204 resumeOakAccount passes a live-session token timeout through as unavailable and a revoke as sign-in-required', async () => {
  for (const [mint, code] of [[() => new Promise(() => {}), 'unavailable'], [async () => { throw new Error('session revoked'); }, 'sign-in-required']]) {
    const { f, cleanup } = await idleAccount();
    f.sdkInstances[0].session.getToken = mint;
    const pending = f.account.resumeOakAccount(publicKey).then(() => 'resolved', error => error.code);
    for (let round = 0; round < 6; round++) { await tick(); for (const [id, timer] of [...f.timers]) { f.timers.delete(id); timer(); } }
    assert.equal(await pending, code);
    cleanup();
  }
});
