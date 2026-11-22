import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strictLoader } from './design-rework/load-tsx.mjs';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const load = strictLoader(import.meta.url);
// Q16-D5: the local-cap bound comes from the shared contract, the same value the Worker enforces.
const serviceStatus = load('../../packages/oak-agent-contracts/src/service-status.ts');
const voice = load('../../src/lib/oakVoiceCapture.ts', { './oakTurnstile': load('../../src/lib/oakTurnstile.ts'), '../../packages/oak-agent-contracts/src/service-status': serviceStatus });
const status = () => ({ schemaVersion: 1, service: 'transcription', enabled: true, admission: 'available', failure: 'none',
  evidence: { settings: 'verified', providerUsage: 'verified', localReservations: 'verified' },
  allowance: { unit: 'micro-usd', limit: 100_000, providerObserved: 0, reserved: 0, conservativeUsed: 0,
    remainingBound: 100_000, periodStart: null, periodEnd: null, reset: 'unknown' },
  health: { lastCheckAt: Date.now(), settingsObservedAt: Date.now(), usageObservedAt: Date.now(),
    lastAttemptAt: null, lastSuccessAt: null, accepted: 0, failed: 0, timedOut: 0 } });
const configuration = (transport = async (_url, init) => new Response(JSON.stringify({ requestId: init.headers['X-Oak-Request-ID'], text: 'Review this visitor question.' }))) =>
  ({ enabled: true, status: status(), fetch: transport });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture(options = {}) {
  const track = new EventTarget(); track.stops = 0; track.stop = () => { track.stops++; };
  const stream = { getTracks: () => [track] };
  const recorders = [], microphones = [], decodes = [], requests = [];
  const env = {
    supports: mime => options.mime ? mime === options.mime : mime === 'audio/webm;codecs=opus',
    microphone: async () => { microphones.push(true); return options.microphone ? options.microphone() : stream; },
    recorder: (_stream, mime) => {
      const recorder = { state: 'inactive', mime, ondataavailable: null, onstop: null, onerror: null,
        start() { this.state = 'recording'; }, stop() {
          this.state = 'inactive'; this.ondataavailable?.({ data: options.blob ?? new Blob(['PRIVATE_AUDIO_CANARY']) }); this.onstop?.();
        } };
      recorders.push(recorder); return recorder;
    },
    decode: async (clip, signal) => { decodes.push({ clip, signal }); return options.decode ? options.decode(clip, signal) :
      { channels: [new Float32Array([0.5, -0.5, 0, 0.25])], sampleRate: 16_000 }; },
  };
  const config = options.configuration ?? configuration(async (url, init) => {
    requests.push({ url, init }); return options.transport ? options.transport(url, init) :
      new Response(JSON.stringify({ requestId: init.headers['X-Oak-Request-ID'], text: options.text ?? 'Review this visitor question.' }));
  });
  const capture = voice.createVoiceCapture(() => config, env);
  return { capture, config, track, stream, recorders, microphones, decodes, requests, env };
}

test('actual PCM encoder bounds30seconds, resamples/joins channels and writes only a canonical mono16k WAV', () => {
  const bytes = voice.mono16kWav([new Float32Array(48_000).fill(1), new Float32Array(48_000).fill(-1)], 48_000);
  const view = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), 'RIFF');
  assert.equal(new TextDecoder().decode(bytes.subarray(8, 16)), 'WAVEfmt ');
  assert.equal(new TextDecoder().decode(bytes.subarray(36, 40)), 'data');
  assert.equal(bytes.length, 32_044); assert.equal(view.getUint32(4, true), bytes.length - 8);
  assert.equal(view.getUint16(20, true), 1); assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16_000); assert.equal(view.getUint32(28, true), 32_000);
  assert.equal(view.getUint16(32, true), 2); assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 32_000); assert.equal(view.getInt16(44, true), 0);
  assert.equal(voice.mono16kWav([new Float32Array(480_000)], 16_000).length, voice.voiceWavBytes);
  const extremes = new DataView(voice.mono16kWav([new Float32Array([-2, 2])], 16_000).buffer);
  assert.equal(extremes.getInt16(44, true), -32768); assert.equal(extremes.getInt16(46, true), 32767);
  for (const [channels, rate, category] of [
    [[new Float32Array(480_001)], 16_000, 'duration'], [[new Float32Array()], 16_000, 'empty'],
    [[new Float32Array([NaN])], 16_000, 'capture'], [[new Float32Array([1]), new Float32Array(2)], 16_000, 'capture'],
    [[new Float32Array([1])], 0, 'capture'],
  ]) assert.throws(() => voice.mono16kWav(channels, rate), error => error.category === category);
});

test('defaultOFF, unknown/stale/future evidence and exhausted allowance prevent permission and any HTTP call', async () => {
  for (const config of [undefined, { ...configuration(), enabled: false },
    { ...configuration(), status: { ...status(), evidence: { ...status().evidence, settings: 'unknown' } } },
    { ...configuration(), status: { ...status(), health: { ...status().health, usageObservedAt: Date.now() - 300_001 } } },
    { ...configuration(), status: { ...status(), health: { ...status().health, settingsObservedAt: Date.now() + 60_000 } } },
    { ...configuration(), status: { ...status(), allowance: { ...status().allowance, remainingBound: 0 } } },
    { ...configuration(), status: { ...status(), admission: 'exhausted' } },
    { ...configuration(), status: { ...status(), allowance: { ...status().allowance, remainingBound: 1.5 } } },
    { ...configuration(), status: { ...status(), allowance: { ...status().allowance, unit: 'audio-seconds' } } },
  ]) {
    const f = fixture({ configuration: config ?? voice.disabledVoiceConfiguration });
    await f.capture.record(); assert.equal(f.microphones.length, 0); assert.equal(f.requests.length, 0);
    assert.equal(f.capture.getSnapshot().failure, 'service'); f.capture.dispose();
  }
});

test('fresh server-admitted provider allowance below the legacy reserve threshold is eligible', async () => {
  const exact = { ...configuration(), status: { ...status(), allowance: { ...status().allowance, remainingBound: 2_150 } } };
  assert.equal(voice.voiceServiceAvailable(exact), true);
  const accepted = fixture({ configuration: exact }); await accepted.capture.record();
  assert.equal(accepted.microphones.length, 1); assert.equal(accepted.requests.length, 0); accepted.capture.dispose();
  for (const part of ['settings', 'providerUsage', 'localReservations']) {
    const config = { ...exact, status: { ...exact.status, evidence: { ...exact.status.evidence, [part]: 'estimated' } } };
    const f = fixture({ configuration: config }); await f.capture.record();
    assert.equal(f.microphones.length, 0); assert.equal(f.requests.length, 0); f.capture.dispose();
  }
});

test('cached usage is available through60seconds only while settings remain fresh through300seconds', async () => {
  const now = Date.now(), config = configuration();
  config.status.health.settingsObservedAt = now - 300000;
  config.status.health.usageObservedAt = now - 60000;
  assert.equal(voice.voiceServiceAvailable(config, now), true);
  config.status.health.usageObservedAt = now - 60001;
  assert.equal(voice.voiceServiceAvailable(config, now), false);
  const f = fixture({ configuration: config }); await f.capture.record();
  assert.equal(f.microphones.length, 0); assert.equal(f.requests.length, 0); f.capture.dispose();
  config.status.health.usageObservedAt = now;
  config.status.health.settingsObservedAt = now - 300001;
  assert.equal(voice.voiceServiceAvailable(config, now), false);
});

test('local-cap voice permits explicit recording against a fresh local budget while vendor credit remains unknown', async () => {
  const now = Date.now(), local = { ...status(), admissionBasis: 'local-cap',
    evidence: { settings: 'verified', providerUsage: 'unknown', localReservations: 'verified' },
    localBudget: { limit: 43_786, reserved: 0, remainingBound: 43_786 },
    allowance: { ...status().allowance, limit: null, providerObserved: null, conservativeUsed: null, remainingBound: null },
    health: { ...status().health, lastCheckAt: now, settingsObservedAt: now, usageObservedAt: null } };
  const config = { ...configuration(), status: local };
  assert.equal(voice.voiceServiceAvailable(config, now), true);
  const working = fixture({ configuration: config });
  try { await working.capture.record(); assert.equal(working.microphones.length, 1); assert.equal(working.requests.length, 0); }
  finally { working.capture.dispose(); }
  for (const invalid of [
    { ...local, admissionBasis: 'invented-basis' }, { ...local, admissionBasis: undefined },
    { ...local, localBudget: { ...local.localBudget, remainingBound: 43_785 } },
    { ...local, localBudget: { limit: 43_786, reserved: 43_786, remainingBound: 0 } },
    { ...local, localBudget: { ...local.localBudget, remainingBound: 1.5 } },
    { ...local, localBudget: { ...local.localBudget, limit: Infinity } },
    { ...local, evidence: { ...local.evidence, settings: 'unknown' } },
    { ...local, admission: 'exhausted' },
    // Q16 (intentional update): a local-cap record stays verified until its credit expires (ADR 0003, server voice/evidence.ts);
    // staleness reaches the browser as evidence.settings, covered above, so an old settingsObservedAt alone no longer disables voice.
    { ...local, health: { ...local.health, lastCheckAt: now - 60001 } },
  ]) {
    assert.equal(voice.voiceServiceAvailable({ ...config, status: invalid }, now), false);
    const rejected = fixture({ configuration: { ...config, status: invalid } });
    try { await rejected.capture.record(); assert.equal(rejected.microphones.length, 0); assert.equal(rejected.requests.length, 0); }
    finally { rejected.capture.dispose(); }
  }
  assert.equal(config.status.allowance.providerObserved, null);
});

test('Q16-D5 local-cap voice stays available a day after its account record was attested', () => {
  const now = Date.now(), local = { ...status(), admissionBasis: 'local-cap',
    evidence: { settings: 'verified', providerUsage: 'unknown', localReservations: 'verified' },
    localBudget: { limit: 43_786, reserved: 0, remainingBound: 43_786 },
    allowance: { ...status().allowance, limit: null, providerObserved: null, conservativeUsed: null, remainingBound: null },
    health: { ...status().health, lastCheckAt: now, settingsObservedAt: now - 41 * 3_600_000, usageObservedAt: null } };
  assert.equal(voice.voiceServiceAvailable({ ...configuration(), status: local }, now), true);
  // The live key queue record caps the key at its whole $200 credit (200,000,000 micro-USD); the browser must accept it.
  const live = { ...local, localBudget: { limit: 200_000_000, reserved: 6_600, remainingBound: 199_993_400 } };
  assert.equal(voice.voiceServiceAvailable({ ...configuration(), status: live }, now), true);
  assert.equal(voice.voiceServiceAvailable({ ...configuration(), status: { ...live, localBudget: { limit: 1_000_000_001, reserved: 0, remainingBound: 1_000_000_001 } } }, now), false);
});

test('explicit Record/Stop/Transcribe returns text without chat dispatch or raw audio in subscriber state', async () => {
  const f = fixture(), states = []; const unsubscribe = f.capture.subscribe(() => states.push(f.capture.getSnapshot()));
  assert.equal(f.microphones.length, 0); assert.equal(f.requests.length, 0);
  await f.capture.record(); await f.capture.record(); assert.equal(f.microphones.length, 1);
  assert.equal(f.capture.getSnapshot().phase, 'recording'); assert.equal(f.requests.length, 0);
  f.capture.stop(); f.capture.stop(); assert.equal(f.track.stops, 1);
  assert.equal(f.capture.getSnapshot().phase, 'clip-ready'); assert.equal(f.requests.length, 0);
  const first = f.capture.transcribe(); await f.capture.transcribe(); await first;
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].url, '/api/oak/transcription');
  const { init } = f.requests[0]; assert.equal(init.credentials, 'same-origin'); assert.equal(init.redirect, 'error');
  assert.equal(init.body.type, 'audio/wav'); assert.equal(init.body.size, 52);
  assert.deepEqual(Object.keys(init.headers).sort(), ['Content-Type', 'X-Oak-Request-ID']);
  assert.match(init.headers['X-Oak-Request-ID'], /^[0-9a-f-]{36}$/);
  assert.equal(f.capture.getSnapshot().phase, 'review');
  assert.doesNotMatch(JSON.stringify(states), /PRIVATE_AUDIO_CANARY|blob|channels|pcm|key|credential/i);
  assert.ok(states.every(value => Object.keys(value).sort().join(',') === 'failure,phase,seconds,transcript'));
  unsubscribe(); f.capture.dispose();
});

test('permission denial, missing/unsupported device or codec are safe and make no upload', async () => {
  for (const [name, category] of [['NotAllowedError', 'permission'], ['NotFoundError', 'device'], ['NotReadableError', 'device']]) {
    const f = fixture({ microphone: async () => { throw new DOMException('PRIVATE_PROVIDER_ERROR', name); } });
    await f.capture.record(); assert.equal(f.capture.getSnapshot().failure, category);
    assert.equal(f.requests.length, 0); assert.doesNotMatch(JSON.stringify(f.capture.getSnapshot()), /PRIVATE_PROVIDER_ERROR/); f.capture.dispose();
  }
  const unsupported = fixture({ mime: 'unsupported' }); await unsupported.capture.record();
  assert.equal(unsupported.capture.getSnapshot().failure, 'unsupported'); assert.equal(unsupported.microphones.length, 0); unsupported.capture.dispose();
  const missingApi = voice.createVoiceCapture(() => configuration()); await missingApi.record();
  assert.equal(missingApi.getSnapshot().failure, 'unsupported'); missingApi.dispose();
  const mp4 = fixture({ mime: 'audio/mp4' }); await mp4.capture.record(); mp4.capture.stop(); await mp4.capture.transcribe();
  assert.equal(mp4.recorders[0].mime, 'audio/mp4'); assert.equal(mp4.requests[0].init.body.type, 'audio/wav'); mp4.capture.dispose();
});

test('cancel/dispose during pending permission stops late acquired tracks and never starts recording', async () => {
  for (const action of ['cancel', 'dispose']) {
    const pending = deferred(), f = fixture({ microphone: () => pending.promise });
    const recording = f.capture.record(); f.capture[action](); pending.resolve(f.stream); await recording;
    assert.equal(f.track.stops, 1); assert.equal(f.recorders.length, 0); assert.equal(f.requests.length, 0);
    assert.equal(f.capture.getSnapshot().phase, 'idle'); f.capture.dispose();
  }
});

test('track interruption, empty capture and capture-byte overflow discard the clip without uploading', async () => {
  const interrupted = fixture(); await interrupted.capture.record(); interrupted.track.dispatchEvent(new Event('ended'));
  assert.equal(interrupted.capture.getSnapshot().failure, 'capture'); assert.equal(interrupted.track.stops, 1); interrupted.capture.dispose();
  const errored = fixture(); await errored.capture.record(); errored.recorders[0].onerror({});
  assert.equal(errored.capture.getSnapshot().failure, 'capture'); assert.equal(errored.track.stops, 1); errored.capture.dispose();
  for (const [blob, category] of [[new Blob([]), 'empty'], [new Blob([new Uint8Array(voice.voiceCaptureBytes + 1)]), 'bytes']]) {
    const f = fixture({ blob }); await f.capture.record(); f.capture.stop(); await f.capture.transcribe();
    assert.equal(f.capture.getSnapshot().failure, category); assert.equal(f.requests.length, 0); assert.equal(f.track.stops, 1); f.capture.dispose();
  }
});

test('recording timer stops at30seconds and permission/normalization latency is finite', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_000_000 });
  const f = fixture(); await f.capture.record(); t.mock.timers.tick(30_000);
  assert.equal(f.capture.getSnapshot().phase, 'clip-ready'); assert.equal(f.track.stops, 1); assert.equal(f.requests.length, 0); f.capture.dispose();
  const permission = deferred(), p = fixture({ microphone: () => permission.promise }); const recording = p.capture.record();
  t.mock.timers.tick(20_000); assert.equal(p.capture.getSnapshot().failure, 'deadline');
  permission.resolve(p.stream); await recording; assert.equal(p.track.stops, 1); p.capture.dispose();
  const decode = deferred(), d = fixture({ decode: () => decode.promise }); await d.capture.record(); d.capture.stop();
  const work = d.capture.transcribe(); t.mock.timers.tick(30_000); await work;
  assert.equal(d.capture.getSnapshot().failure, 'deadline'); assert.equal(d.requests.length, 0); assert.equal(d.decodes[0].signal.aborted, true); d.capture.dispose();
});

test('overlong/invalid decoded clips and failed/empty transcription preserve visitor typing, never truncate or retry', async () => {
  for (const options of [
    { decode: async () => ({ channels: [new Float32Array(480_001)], sampleRate: 16_000 }) },
    { decode: async () => { throw new DOMException('PRIVATE_CODEC_ERROR', 'EncodingError'); } },
    { transport: async () => new Response('PRIVATE_PROVIDER_ERROR', { status: 503 }) },
    { transport: async () => { throw new Error('PRIVATE_KEY_CANARY'); } }, { text: '' },
  ]) {
    const f = fixture(options); f.capture.edit('Existing edited visitor text.'); await f.capture.record(); f.capture.stop(); await f.capture.transcribe();
    assert.equal(f.capture.getSnapshot().phase, 'failed'); assert.ok(f.requests.length <= 1);
    assert.equal(f.capture.getSnapshot().transcript, options.text === '' ? '' : 'Existing edited visitor text.');
    assert.doesNotMatch(JSON.stringify(f.capture.getSnapshot()), /PRIVATE_PROVIDER_ERROR|PRIVATE_KEY_CANARY/); f.capture.dispose();
  }
});

test('cancel during normalization/upload ignores late text and releases the owned operation', async () => {
  const delayed = deferred(), f = fixture({ decode: () => delayed.promise }); await f.capture.record(); f.capture.stop();
  const work = f.capture.transcribe(); f.capture.cancel(); await work;
  delayed.resolve({ channels: [new Float32Array([1])], sampleRate: 16_000 }); await Promise.resolve();
  assert.equal(f.requests.length, 0); assert.equal(f.capture.getSnapshot().phase, 'idle'); f.capture.dispose();
  const u = fixture({ transport: async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')))) });
  await u.capture.record(); u.capture.stop(); const uploading = u.capture.transcribe();
  for (let n = 0; n < 6 && !u.requests.length; n++) await Promise.resolve();
  assert.equal(u.requests.length, 1); u.capture.cancel(); await uploading;
  assert.equal(u.requests[0].init.signal.aborted, true); assert.equal(u.capture.getSnapshot().phase, 'idle'); u.capture.dispose();
});

test('HTTP response identity, shape, byte and text ceilings reject without a retry', async () => {
  const clip = new Blob([voice.mono16kWav([new Float32Array([0.5])], 16_000)], { type: 'audio/wav' });
  for (const response of [
    () => new Response(JSON.stringify({ requestId: crypto.randomUUID(), text: 'Wrong identity.' })),
    (_url, init) => new Response(JSON.stringify({ requestId: init.headers['X-Oak-Request-ID'], text: 'x'.repeat(4001) })),
    (_url, init) => new Response(JSON.stringify({ requestId: init.headers['X-Oak-Request-ID'], text: 'valid', key: 'PRIVATE_KEY' })),
    () => new Response('x'.repeat(16_257)),
  ]) {
    let calls = 0; const config = configuration(async (...args) => { calls++; return response(...args); });
    await assert.rejects(voice.transcribeVoiceClip(clip, crypto.randomUUID(), new AbortController().signal, config), error => error.category === 'transcription');
    assert.equal(calls, 1);
  }
  const signal = new AbortController(); signal.abort(); let calls = 0;
  await assert.rejects(voice.transcribeVoiceClip(clip, crypto.randomUUID(), signal.signal, configuration(async () => { calls++; })), error => error.name === 'AbortError');
  assert.equal(calls, 0);
});

test('HTTP deadline and abort during response reading cancel once and never retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const clip = new Blob([voice.mono16kWav([new Float32Array([0.5])], 16_000)], { type: 'audio/wav' });
  let calls = 0;
  const work = voice.transcribeVoiceClip(clip, crypto.randomUUID(), new AbortController().signal,
    configuration(async () => { calls++; return new Promise(() => {}); }));
  t.mock.timers.tick(30_000); await assert.rejects(work, error => error.category === 'deadline'); assert.equal(calls, 1);
  const abort = new AbortController(); let cancelled = 0;
  const reading = voice.transcribeVoiceClip(clip, crypto.randomUUID(), abort.signal, configuration(async () =>
    new Response(new ReadableStream({ cancel() { cancelled++; } }))));
  for (let n = 0; n < 5; n++) await Promise.resolve();
  abort.abort(); await assert.rejects(reading, error => error.name === 'AbortError'); assert.equal(cancelled, 1);
});

function renderWidget(capture, configurationValue, onUseTranscript) {
  const effects = [];
  const widget = load('../../src/components/agent/OakVoiceCapture.tsx', {
    react: { ...React, useRef: value => ({ current: value }), useState: value => [typeof value === 'function' ? value() : value, () => {}],
      useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useId: () => 'voice-test', useEffect: effect => effects.push(effect) }, 'react/jsx-runtime': jsx,
    '@/components/ui/field': { Field: 'div', FieldLabel: 'label', FieldControl: ({ render, ...props }) => React.cloneElement(render, props) },
    '@/components/ui/textarea': { Textarea: 'textarea' }, '@/components/ui/callout': { Callout: 'div' }, '@/components/ui/spinner': { Spinner: 'span' },
    '@/components/ui/button': { Button: 'button' }, '@/components/ui/Icon': { Icon: () => React.createElement('span') }, '@/lib/oakVoiceCapture': voice,
  });
  return { tree: widget.OakVoiceCapture({ configuration: configurationValue, onUseTranscript, controller: capture }), effects };
}
function elements(tree) {
  return !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(elements)];
}
test('widget escapes editable visitor text, copies only on explicit Use and cleanup cancels capture', async () => {
  const f = fixture({ text: '<script>visitor text</script>' }); await f.capture.record(); f.capture.stop(); await f.capture.transcribe();
  const used = []; let rendered = renderWidget(f.capture, f.config, text => used.push(text));
  const html = renderToStaticMarkup(rendered.tree);
  assert.match(html, /&lt;script&gt;visitor text&lt;\/script&gt;/); assert.match(html, /for="voice-test-text"/); assert.match(html, /id="voice-test-text"/);
  assert.equal(used.length, 0); assert.ok(elements(rendered.tree).filter(element => element.type === 'button').every(element => element.props.type === 'button'));
  const use = elements(rendered.tree).find(element => element.type === 'button' && element.props.children === 'Use transcript');
  use.props.onClick(); assert.deepEqual(used, ['<script>visitor text</script>']); assert.equal(f.requests.length, 1);
  f.capture.edit('x'.repeat(4001)); rendered = renderWidget(f.capture, f.config, text => used.push(text));
  const blocked = elements(rendered.tree).find(element => element.type === 'button' && element.props.children === 'Use transcript');
  assert.equal(blocked.props.disabled, true); blocked.props.onClick(); assert.equal(used.length, 1); assert.equal(f.capture.getSnapshot().transcript.length, 4001);
  f.capture.dispose();
  const closingUsed = [], closing = fixture(), mounted = renderWidget(closing.capture, closing.config, text => closingUsed.push(text));
  const cleanups = mounted.effects.map(effect => effect()).filter(cleanup => typeof cleanup === 'function');
  try {
    await closing.capture.record(); assert.equal(closing.capture.getSnapshot().phase, 'recording');
    for (const cleanup of cleanups) cleanup();
    assert.equal(closing.capture.getSnapshot().phase, 'idle'); assert.equal(closing.track.stops, 1);
    assert.deepEqual(closingUsed, []); assert.equal(closing.requests.length, 0);
  } finally { closing.capture.dispose(); }
});

test('P10-G2 the daily limit and the human check each get their own calm message; other refusals stay generic', async () => {
  const clip = new Blob([voice.mono16kWav([new Float32Array([0.5])], 16_000)], { type: 'audio/wav' });
  const refuse = (status, error) => configuration(async () => new Response(JSON.stringify({ error }), { status }));
  for (const [status, error, category] of [[429, 'transcription-daily-limit', 'daily'], [403, 'turnstile-required', 'check'],
    [403, 'origin-denied', 'transcription'], [429, 'transcription-unavailable', 'service']])
    await assert.rejects(voice.transcribeVoiceClip(clip, crypto.randomUUID(), new AbortController().signal, refuse(status, error)), e => e.category === category);
  assert.match(voice.voiceFailureText.daily, /midnight UTC/);
});
