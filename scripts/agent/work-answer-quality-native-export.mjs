import { createTraceSanitizer } from '../../workers/oak-agent/src/tracing/sanitize.ts';
import { parseTraceRetrieval } from '../../workers/oak-agent/src/tracing/retrieval.ts';
import { randomUUID } from 'node:crypto';
import { NATIVE_QUALITY_EXPORT_ROUTE, NATIVE_QUALITY_EXPORT_MAX_RUNS, NATIVE_QUALITY_EXPORT_MAX_BYTES,
  NATIVE_QUALITY_EXPORT_DEADLINE_MS, parseNativeQualityExportResult } from '../../workers/oak-agent/src/setup/work-answer-quality-native-export.ts';

export const nativeQualityExportRoute = NATIVE_QUALITY_EXPORT_ROUTE;
export const nativeQualityExportChannel = 'oak.work-answer-quality.native-export.v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxRuns = NATIVE_QUALITY_EXPORT_MAX_RUNS, maxBytes = NATIVE_QUALITY_EXPORT_MAX_BYTES, deadlineMs = NATIVE_QUALITY_EXPORT_DEADLINE_MS;
const failed = () => ({ state: 'failed', failure: 'transport', exportedRuns: 0 });
const blocked = () => ({ state: 'blocked', failure: 'capture', exportedRuns: 0 });
const timeout = () => ({ state: 'timeout', failure: 'deadline', exportedRuns: 0 });
const dictionary = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = value => JSON.parse(JSON.stringify(value));

/** Reconstruct only the existing payload-free result contract. */
export const nativeQualityExportResult = parseNativeQualityExportResult;

function finalizedVisitorTree(runs, expectedFundingMode) {
  if (!Array.isArray(runs) || !runs.length || runs.length > maxRuns ||
    Buffer.byteLength(JSON.stringify(runs)) > maxBytes) return false;
  const root = runs[0], ids = new Map();
  if (!uuid.test(root?.id) || root.run_type !== 'chain' || root.parent_run_id !== undefined ||
    root.extra?.metadata?.audience !== 'visitor' || root.extra.metadata.fundingMode !== expectedFundingMode ||
    root.extra.metadata.requestId !== root.id || !uuid.test(root.extra.metadata.conversationId) ||
    root.extra.metadata.thread_id !== root.extra.metadata.conversationId || !dictionary(root.extra.metadata.versions) ||
    !['prompt', 'model', 'knowledge', 'character'].every(name => typeof root.extra.metadata.versions[name] === 'string' && root.extra.metadata.versions[name]) ||
    !['completed', 'failed', 'aborted'].includes(root.extra.metadata.outcome)) return false;
  for (const run of runs) {
    const parent = ids.get(run.parent_run_id), metadata = run.extra?.metadata;
    if (!uuid.test(run.id) || ids.has(run.id) || run.trace_id !== root.id || !dictionary(run.inputs) ||
      !dictionary(run.outputs) || !dictionary(metadata) || !run.end_time ||
      !Number.isFinite(Date.parse(run.start_time)) || Date.parse(run.end_time) < Date.parse(run.start_time) ||
      !Number.isFinite(Date.parse(run.end_time)) || typeof run.dotted_order !== 'string' ||
      metadata.requestId !== root.id || metadata.conversationId !== root.extra.metadata.conversationId ||
      metadata.thread_id !== root.extra.metadata.conversationId ||
      metadata.audience !== 'visitor' || metadata.fundingMode !== expectedFundingMode ||
      JSON.stringify(metadata.versions) !== JSON.stringify(root.extra.metadata.versions) ||
      run !== root && (!parent || !['llm', 'tool'].includes(run.run_type) || !run.dotted_order.startsWith(parent.dotted_order + '.')) ||
      run.run_type !== 'llm' && run.total_cost !== undefined) return false;
    if (Object.hasOwn(metadata, 'retrieval')) {
      if (run.run_type !== 'tool' || run.name !== 'search') return false;
      parseTraceRetrieval(metadata.retrieval);
    }
    ids.set(run.id, run);
  }
  return true;
}

/** The caller owns the original LangSmith exporter and its retained quota actor.
 * This facade never opens, resets, replaces or refunds a quota/money store. */
export function createNativeQualityParentExporter(exporter, credentials = [], { expectedFundingMode = 'sponsored' } = {}) {
  if (!exporter || typeof exporter.send !== 'function') throw new Error('native-parent-exporter-required');
  if (!['sponsored', 'visitor'].includes(expectedFundingMode)) throw new Error('native-parent-funding-mode-required');
  const scrub = createTraceSanitizer([...credentials, ...(exporter.credentials ?? [])]);
  let attempted = false, delivery, captured = [], controller;
  return {
    send(runs, signal) {
      if (attempted) return Promise.resolve(blocked());
      attempted = true;
      delivery = (async () => {
        let timer;
        const cancel = () => controller.abort();
        controller = new AbortController();
        try {
          captured = copy(scrub.sanitize(runs));
          if (!finalizedVisitorTree(captured, expectedFundingMode)) { captured = []; return blocked(); }
          if (signal.aborted) return timeout();
          signal.addEventListener('abort', cancel, { once: true });
          return nativeQualityExportResult(await Promise.race([
            Promise.resolve().then(() => exporter.send(captured, controller.signal)),
            new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(timeout()); }, deadlineMs); }),
          ]), captured.length);
        } catch { return controller.signal.aborted ? timeout() : failed(); }
        finally { signal.removeEventListener('abort', cancel); if (timer !== undefined) clearTimeout(timer); }
      })();
      return delivery;
    },
    wait: async () => delivery ? await delivery : null,
    snapshot: () => copy(captured),
    abort: () => controller?.abort(),
  };
}

/** Dedicated child IPC, not a public/network collector or an env-JSON exporter. */
export function attachNativeQualityParentExporter(child, parent) {
  let requestId, controller;
  const reply = (id, result) => {
    if (!child.connected) return;
    try { child.send({ channel: nativeQualityExportChannel, type: 'result', id, result }, () => {}); } catch { /* Child stopped. Holds remain. */ }
  };
  const receive = message => {
    if (!dictionary(message) || message.channel !== nativeQualityExportChannel || !uuid.test(message.id)) return;
    if (message.type === 'cancel') { if (message.id === requestId) controller?.abort(); return; }
    if (message.type !== 'send') return;
    if (requestId !== undefined) { reply(message.id, blocked()); return; }
    requestId = message.id; controller = new AbortController();
    parent.send(message.runs, controller.signal).then(result => reply(message.id, result), () => reply(message.id, failed()));
  };
  const cancel = () => { controller?.abort(); };
  child.on('message', receive); child.on('close', cancel);
  return () => { child.off('message', receive); child.off('close', cancel); cancel(); };
}

async function boundedBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('native-export-body-required');
  let bytes = 0, raw = ''; const decoder = new TextDecoder();
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      if ((bytes += next.value.byteLength) > maxBytes) throw new Error('native-export-body-limit');
      raw += decoder.decode(next.value, { stream: true });
    }
    return JSON.parse(raw + decoder.decode());
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Miniflare service handler lives in the child Node host. Workerd receives only
 * its Fetcher. The actual exporter, key and quota remain in the parent process. */
export function createNativeQualityExportService(ipc = process) {
  let attempted = false;
  return async request => {
    if (request.url !== nativeQualityExportRoute || request.method !== 'POST') return Response.json(blocked(), { status: 404 });
    if (attempted) return Response.json(blocked());
    attempted = true;
    try {
      const runs = await boundedBody(request);
      if (!Array.isArray(runs) || !runs.length || runs.length > maxRuns) return Response.json(blocked());
      if (request.signal.aborted) return Response.json(timeout());
      if (typeof ipc.send !== 'function') return Response.json(failed());
      const id = randomUUID();
      const result = await new Promise(resolve => {
        let settled = false, timer;
        const finish = result => {
          if (settled) return; settled = true;
          clearTimeout(timer); ipc.off('message', receive); request.signal.removeEventListener('abort', cancel);
          resolve(result);
        };
        const receive = message => {
          if (dictionary(message) && message.channel === nativeQualityExportChannel && message.type === 'result' && message.id === id)
            finish(nativeQualityExportResult(message.result, runs.length));
        };
        const cancel = () => {
          try { ipc.send({ channel: nativeQualityExportChannel, type: 'cancel', id }, () => {}); } catch { /* No retry. */ }
          finish(timeout());
        };
        ipc.on('message', receive); request.signal.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(cancel, deadlineMs);
        try {
          ipc.send({ channel: nativeQualityExportChannel, type: 'send', id, runs }, error => { if (error) finish(failed()); });
        } catch { finish(failed()); }
      });
      return Response.json(result);
    } catch { return Response.json(request.signal.aborted ? timeout() : blocked()); }
  };
}
