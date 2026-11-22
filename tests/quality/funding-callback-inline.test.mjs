import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const origin = 'https://steveoak.com';
const callbackMarkup = readFileSync(new URL('../../src/pages/oak/funding/callback.astro', import.meta.url), 'utf8');
const inlineScript = callbackMarkup.match(/<script\b[^>]*\bis:inline\b[^>]*>([\s\S]*?)<\/script>/u)?.[1];
assert.ok(inlineScript, 'callback page has the expected inline script');

function callbackAt(search = '', hash = '', { withOpener = true } = {}) {
  const location = { origin, pathname: '/oak/funding/callback', search, hash, href: `${origin}/oak/funding/callback${search}${hash}` };
  const listeners = new Map();
  const timers = new Map();
  let nextTimer = 0;
  let now = 1_800_000_000_000;
  const sent = [];
  const status = { textContent: '' };
  const opener = withOpener ? {
    postMessage(data, targetOrigin) {
      sent.push({ data, targetOrigin, hrefAtSend: location.href });
    },
  } : null;
  const document = { readyState: 'complete', querySelector: selector => selector === '[data-funding-status]' ? status : null };
  const window = {
    opener,
    location,
    history: {
      replaceState(_state, _title, path) {
        const scrubbed = new URL(path, origin);
        location.pathname = scrubbed.pathname;
        location.search = scrubbed.search;
        location.hash = scrubbed.hash;
        location.href = scrubbed.href;
      },
    },
    crypto: { getRandomValues(bytes) { bytes.fill(7); return bytes; } },
    addEventListener(type, listener) {
      const values = listeners.get(type) ?? new Set(); values.add(listener); listeners.set(type, values);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  runInNewContext(inlineScript, { window, document, URLSearchParams, btoa, Date: { now: () => now } });
  return {
    location, opener, sent, status,
    message(data, source = opener, eventOrigin = origin) {
      for (const listener of listeners.get('message') ?? []) listener({ data, source, origin: eventOrigin });
    },
    pagehide() { for (const listener of listeners.get('pagehide') ?? []) listener({}); },
    fireTimeout() {
      for (const [id, timer] of [...timers]) {
        timers.delete(id);
        timer.callback();
      }
    },
    advanceTime(milliseconds) { now += milliseconds; },
    listenerCount(type) { return listeners.get(type)?.size ?? 0; },
    timerDelays() { return [...timers.values()].map(timer => timer.delay); },
  };
}

test('actual callback script scrubs the URL, sends code-free ready, then returns one code after a valid bind', () => {
  const page = callbackAt('?code=single-use-fixture-code');
  assert.equal(page.location.href, `${origin}/oak/funding/callback`);
  assert.equal(page.sent.length, 1);
  const ready = page.sent[0];
  assert.equal(ready.targetOrigin, origin);
  assert.equal(ready.hrefAtSend, `${origin}/oak/funding/callback`);
  assert.deepEqual(Object.keys(ready.data).sort(), ['challenge', 'type']);
  assert.equal(ready.data.type, 'oak-funding-ready');
  assert.match(ready.data.challenge, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(JSON.stringify(ready.data).includes('single-use-fixture-code'), false);

  const nonce = 'N'.repeat(43);
  const bind = { type: 'oak-funding-bind', challenge: ready.data.challenge, nonce };
  page.message(bind, {}, origin);
  page.message(bind, page.opener, 'https://foreign.example');
  page.message({ ...bind, challenge: 'X'.repeat(43) });
  page.message({ ...bind, extra: true });
  assert.equal(page.sent.length, 1);

  page.message(bind);
  page.message(bind);
  assert.equal(page.sent.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(page.sent[1].data)), { type: 'oak-funding-callback', nonce, code: 'single-use-fixture-code' });
  assert.equal(page.sent[1].targetOrigin, origin);
  assert.match(page.status.textContent, /check your original tab for the final connection status/iu);
  assert.equal(page.listenerCount('message'), 0);
  assert.equal(page.listenerCount('pagehide'), 0);
  assert.deepEqual(page.timerDelays(), []);
});

test('callback handshake times out after twelve seconds, clears the code, and rejects a late bind', () => {
  const page = callbackAt('?code=single-use-fixture-code');
  const ready = page.sent[0].data;
  assert.deepEqual(page.timerDelays(), [12_000]);
  page.fireTimeout();
  assert.match(page.status.textContent, /did not confirm the authorization response in time/u);
  assert.equal(page.listenerCount('message'), 0);
  assert.equal(page.listenerCount('pagehide'), 0);
  assert.deepEqual(page.timerDelays(), []);
  page.message({ type: 'oak-funding-bind', challenge: ready.challenge, nonce: 'N'.repeat(43) });
  assert.equal(page.sent.length, 1);
});

test('late bind enforces the handshake deadline even when the browser has not fired its timer', () => {
  const page = callbackAt('?code=single-use-fixture-code');
  const ready = page.sent[0].data;
  page.advanceTime(12_001);
  page.message({ type: 'oak-funding-bind', challenge: ready.challenge, nonce: 'N'.repeat(43) });
  assert.match(page.status.textContent, /did not confirm the authorization response in time/u);
  assert.equal(page.sent.length, 1);
  assert.equal(page.listenerCount('message'), 0);
  assert.equal(page.listenerCount('pagehide'), 0);
  assert.deepEqual(page.timerDelays(), []);
});

test('pagehide cleans the handshake and refuses a later bind', () => {
  const page = callbackAt('?code=single-use-fixture-code');
  const ready = page.sent[0].data;
  page.pagehide();
  assert.match(page.status.textContent, /closed before Oak confirmed the response/u);
  assert.equal(page.listenerCount('message'), 0);
  assert.equal(page.listenerCount('pagehide'), 0);
  assert.deepEqual(page.timerDelays(), []);
  page.message({ type: 'oak-funding-bind', challenge: ready.challenge, nonce: 'N'.repeat(43) });
  assert.equal(page.sent.length, 1);
});

test('missing opener shows a return status without keeping a callback listener or timer', () => {
  const page = callbackAt('?code=single-use-fixture-code', '', { withOpener: false });
  assert.match(page.status.textContent, /original Oak tab is unavailable/u);
  assert.equal(page.sent.length, 0);
  assert.equal(page.listenerCount('message'), 0);
  assert.equal(page.listenerCount('pagehide'), 0);
  assert.deepEqual(page.timerDelays(), []);
});

test('actual callback script scrubs duplicate, unknown, control, oversized, and fragmented query values before safe rejection', () => {
  const cases = [
    ['?code=first&code=second', ''],
    ['?code=first&unknown=second', ''],
    ['?code=first%00second', ''],
    [`?code=${'x'.repeat(513)}`, ''],
    [`?code=${'x'.repeat(2049)}`, ''],
    ['?code=single-use-fixture-code', '#fragment'],
  ];
  for (const [search, hash] of cases) {
    const page = callbackAt(search, hash);
    assert.equal(page.location.href, `${origin}/oak/funding/callback`);
    assert.equal(page.sent.length, 1);
    assert.equal(page.sent[0].hrefAtSend, `${origin}/oak/funding/callback`);
    assert.equal(page.sent[0].data.type, 'oak-funding-ready');
    assert.equal('code' in page.sent[0].data, false);
    page.message({ type: 'oak-funding-bind', challenge: page.sent[0].data.challenge, nonce: 'N'.repeat(43) });
    assert.deepEqual(JSON.parse(JSON.stringify(page.sent[1].data)), { type: 'oak-funding-callback', nonce: 'N'.repeat(43), error: 'unavailable' });
    assert.equal(JSON.stringify(page.sent).includes(search.slice(0, 40)), false);
  }
});

test('actual callback script maps a bounded provider error to a safe cancellation', () => {
  const page = callbackAt('?error=access_denied');
  const ready = page.sent[0].data;
  page.message({ type: 'oak-funding-bind', challenge: ready.challenge, nonce: 'N'.repeat(43) });
  assert.deepEqual(JSON.parse(JSON.stringify(page.sent[1].data)), { type: 'oak-funding-callback', nonce: 'N'.repeat(43), error: 'cancelled' });
  assert.equal(JSON.stringify(page.sent).includes('access_denied'), false);
});
