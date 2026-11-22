#!/usr/bin/env node
/** Private operator client. No provider requests, deployments, or allowance resets. */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { writeFile, rename, open, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ordinaryInferenceKeySchema } from '../packages/oak-agent-contracts/src/funding.ts';
import { parseResearchEvidence, validResearchCredential } from '../workers/oak-agent/src/research/evidence.ts';
import { parseVoiceEvidence, validVoiceCredential } from '../workers/oak-agent/src/voice/evidence.ts';
import { accountSwitchCandidate, preparedAccountSwitchStatus } from './oak-service-account-switch.mjs';
import { monitoringCandidate, monitoringPreparationStatus } from './oak-service-monitoring.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const keyNames = { model: 'SPONSOR_OPENROUTER_KEY', resend: 'RESEND_API_KEY', exa: 'EXA_API_KEY', deepgram: 'DEEPGRAM_API_KEY' };
const validCredential = (service, secret) => service === 'model' ? ordinaryInferenceKeySchema.safeParse(secret).success :
  service === 'resend' ? typeof secret === 'string' && /^re_[A-Za-z0-9_-]{8,509}$/.test(secret) :
  service === 'exa' ? validResearchCredential(secret) : service === 'deepgram' ? validVoiceCredential(secret) : false;
// A staging intent, not runtime configuration or provider-account evidence.
const stagingIntent = z.strictObject({ schemaVersion: z.literal(1), purpose: z.literal('key-version-staging'),
  service: z.enum(['model', 'resend']), revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  accountId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  sourceReceiptSha256: z.string().regex(/^[a-f0-9]{64}$/), previousVersionId: z.uuid().nullable() });
const services = { model: '/api/oak/status', exa: '/api/oak/research/status', deepgram: '/api/oak/transcription/status' };
const number = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const member = (value, values, fallback) => values.includes(value) ? value : fallback;
const qualities = ['verified', 'estimated', 'stale', 'unknown'];
const failureCodes = ['none', 'configuration', 'quota', 'rate', 'rate-or-quota-unknown', 'transport', 'deadline', 'storage', 'capture'];

/** Drop unknown fields, raw errors, account identifiers, and arbitrary strings. */
export function projectStatus(service, raw, now = Date.now()) {
  const row = raw && typeof raw === 'object' ? raw : {};
  if (service === 'model' && row.service === 'oak-agent-v1') {
    return { service, enabled: row.enabled === true, admission: row.enabled === true ? 'available' : 'disabled', failure: 'none',
      // Public status is on/off only since P03-G4; spend lives on the owner page.
      evidence: { settings: 'unknown', providerUsage: 'unknown', localReservations: Number.isSafeInteger(row.heldMicroUsd) ? 'verified' : 'unknown' },
      allowance: { unit: 'micro-usd', limit: number(row.ceilingMicroUsd), providerObserved: null, reserved: number(row.heldMicroUsd),
        conservativeUsed: number(row.actualMicroUsd), remainingBound: number(row.availableMicroUsd), periodStart: null, periodEnd: null, reset: 'unknown' },
      checkedAt: now, usageObservedAt: null };
  }
  const expected = service === 'exa' ? 'public-research' : 'transcription';
  const valid = row.schemaVersion === 1 && row.service === expected && typeof row.enabled === 'boolean';
  if (!valid) return { service, enabled: null, admission: 'failed', failure: 'transport', evidence: {
    settings: 'unknown', providerUsage: 'unknown', localReservations: 'unknown' }, allowance: null, checkedAt: now, usageObservedAt: null };
  const allowance = row.allowance ?? {}, evidence = row.evidence ?? {}, health = row.health ?? {};
  const usageObservedAt = number(health.usageObservedAt);
  const settingsObservedAt = number(health.settingsObservedAt);
  const basis = member(row.admissionBasis, ['verified-provider', 'local-cap'], null);
  const serverCheckedAt = number(health.lastCheckAt);
  const localBudget = row.localBudget && typeof row.localBudget === 'object' ?
    Object.fromEntries(['limit', 'reserved', 'remainingBound'].map(key => [key, number(row.localBudget[key])])) : null;
  const fresh = (quality, observed, maximumAge) => observed === null || observed > now ? 'unknown' :
    now - observed > maximumAge && ['verified', 'estimated'].includes(quality) ? 'stale' : member(quality, qualities, 'unknown');
  return { service, enabled: row.enabled, admission: member(row.admission, ['disabled', 'available', 'blocked', 'exhausted', 'failed'], 'failed'),
    failure: member(row.failure, failureCodes, 'configuration'), evidence: {
      settings: fresh(evidence.settings, settingsObservedAt, service === 'exa' ? 86_400_000 : 300_000),
      providerUsage: fresh(evidence.providerUsage, usageObservedAt, 60_000), localReservations: basis === 'local-cap' ?
        fresh(evidence.localReservations, serverCheckedAt, 60_000) : member(evidence.localReservations, qualities, 'unknown') },
    ...(row.admissionBasis !== undefined ? { admissionBasis: basis } : {}),
    ...(localBudget ? { localBudget } : {}),
    allowance: { unit: member(allowance.unit, ['micro-usd', 'root-traces', 'audio-seconds', 'emails'], 'unknown'),
      ...Object.fromEntries(['limit', 'providerObserved', 'reserved', 'conservativeUsed', 'remainingBound', 'periodStart', 'periodEnd'].map(key => [key, number(allowance[key])])),
      reset: member(allowance.reset, ['utc-calendar-month', 'utc-calendar-day', 'provider-reported', 'unknown'], 'unknown') }, checkedAt: now, usageObservedAt };
}

export function noticeState(status, threshold = 80) {
  if (status.enabled === false) return 'disabled';
  if (status.admission === 'exhausted') return 'exhausted';
  if (status.failure !== 'none' || status.admission === 'failed') return 'failure';
  if (status.admission === 'blocked') return 'blocked';
  if (Object.values(status.evidence).includes('stale')) return 'stale';
  if (status.admissionBasis === 'local-cap') {
    const budget = status.localBudget;
    if (status.evidence.settings !== 'verified' || status.evidence.localReservations !== 'verified' ||
      status.evidence.providerUsage !== 'unknown' || status.allowance?.limit !== null || status.allowance?.providerObserved !== null ||
      status.allowance?.conservativeUsed !== null || status.allowance?.remainingBound !== null ||
      !budget || !Object.values(budget).every(value => Number.isSafeInteger(value) && value >= 0) ||
      budget.limit > 10_000_000 || budget.remainingBound !== Math.max(0, budget.limit - budget.reserved)) return 'unknown';
    // Voice's tariff-bound clip reserve is enforced by server admission.
    if (status.service === 'exa' && budget.remainingBound < 50_000) return 'exhausted';
    if (status.admission !== 'available' || budget.limit === 0) return 'unknown';
    return 100 * (budget.limit - budget.remainingBound) / budget.limit >= threshold ? 'near-limit' : 'ready';
  }
  if (status.admissionBasis !== undefined && status.admissionBasis !== 'verified-provider') return 'unknown';
  const { limit, remainingBound } = status.allowance ?? {};
  if (limit === null || !limit || remainingBound === null || remainingBound > limit) return 'unknown';
  // The sponsor ledger is observable even though it does not expose provider balance.
  if (status.service === 'model' && status.evidence.localReservations === 'verified')
    return 100 * (limit - remainingBound) / limit >= threshold ? 'near-limit' : 'unknown';
  if (Object.values(status.evidence).includes('unknown')) return 'unknown';
  return 100 * (limit - remainingBound) / limit >= threshold ? 'near-limit' : 'ready';
}

/** One durable latest incident per service. Key identity does not participate. */
export function nextNotices(previous, statuses, threshold = 80) {
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 100) throw new Error('invalid-threshold');
  const states = {}, notices = [];
  for (const status of statuses) {
    const state = noticeState(status, threshold), prior = previous?.states?.[status.service]?.state;
    const basis = status.admissionBasis === 'local-cap' ? 'local-cap' : undefined;
    const changed = state !== prior || basis !== previous?.states?.[status.service]?.basis;
    const scope = basis ? { basis } : {};
    states[status.service] = { state, ...scope, since: changed ? status.checkedAt : number(previous.states[status.service].since) ?? status.checkedAt };
    if (changed && !['ready', 'disabled'].includes(state)) notices.push({ service: status.service, notice: state, ...scope, at: status.checkedAt });
    else if (changed && prior && state === 'ready') notices.push({ service: status.service, notice: 'recovered', ...scope, at: status.checkedAt });
  }
  return { schemaVersion: 1, thresholdPercent: threshold, states, notices };
}

async function boundedJson(path) {
  if (!path.endsWith('.json')) throw new Error('json-file-required');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 65_536) throw new Error('invalid-json-file');
    const bytes = Buffer.alloc(65_537);
    let size = 0;
    for (;;) {
      const result = await file.read(bytes, size, bytes.length - size, size);
      size += result.bytesRead;
      if (size > 65_536) throw new Error('input-too-large');
      if (!result.bytesRead) break;
    }
    return JSON.parse(bytes.subarray(0, size).toString('utf8'));
  } finally { await file.close(); }
}

export async function pollStatuses(origin, fetcher = fetch) {
  const base = new URL(origin);
  if (base.username || base.password || base.pathname !== '/' || base.search || base.hash ||
    !(base.protocol === 'https:' || base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) throw new Error('invalid-origin');
  const results = [];
  for (const [service, path] of Object.entries(services)) {
    try {
      const response = await fetcher(new URL(path, base), { signal: AbortSignal.timeout(5000), redirect: 'error', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('status-unavailable');
      // Read bounded aggregate JSON only. Never follow redirects or include credentials.
      const reader = response.body?.getReader();
      if (!reader) throw new Error('status-unavailable');
      let bytes = 0; const chunks = [];
      try {
        for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength;
          if (bytes > 65_536) throw new Error('status-too-large'); chunks.push(Buffer.from(value)); }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      results.push(projectStatus(service, JSON.parse(Buffer.concat(chunks).toString('utf8'))));
    } catch { results.push(projectStatus(service, null)); }
  }
  return results;
}

export function rotationCandidate(service, input, secret) {
  if (service === 'model' || service === 'resend') {
    const parsed = stagingIntent.safeParse(input);
    if (!parsed.success || parsed.data.service !== service || !validCredential(service, secret) ||
      JSON.stringify(parsed.data).includes(secret)) throw new Error('invalid-rotation-input');
    return { ...parsed.data, revision: parsed.data.revision + 1, keySha256: createHash('sha256').update(secret).digest('hex'),
      secretName: keyNames[service], stableActor: service === 'model' ? 'sponsor-v1' : 'owner-alerts-v1',
      deployed: false, activationAuthorized: false, verificationRequired: true,
      settingsQuality: 'unknown', usageQuality: 'unknown', providerBalance: 'unknown',
      keyRotationResetsUsage: false, preservesHistoricalHolds: true,
      requiredVerification: service === 'model' ? ['same-account', 'ordinary-inference-key', 'model-route', 'BYOK-authorization', 'plan-and-free-only-eligibility'] :
        ['same-account', 'sender-and-key-permissions', 'plan-and-free-only-eligibility', 'quota-with-existing-holds-and-incidents'] };
  }
  const parse = service === 'exa' ? parseResearchEvidence : service === 'deepgram' ? parseVoiceEvidence : null;
  const validate = service === 'exa' ? validResearchCredential : validVoiceCredential;
  const evidence = parse?.(input);
  if (!evidence || !validate(secret) || evidence.revision === Number.MAX_SAFE_INTEGER) throw new Error('invalid-rotation-input');
  const digest = createHash('sha256').update(secret).digest('hex');
  const eligibility = evidence.admissionBasis === 'local-cap' ? { freeOnlyEligibility: 'unknown' } : {};
  // Current receipts/timestamps stay historical. A fresh verification must replace them.
  return service === 'exa' ? { ...evidence, ...eligibility, revision: evidence.revision + 1, keyId: digest, settingsQuality: 'unknown', usageQuality: 'unknown',
    providerUsedMicroUsd: null, freeRemainingMicroUsd: null } : { ...evidence, ...eligibility, revision: evidence.revision + 1, keySha256: digest,
    settingsQuality: 'unknown', usageQuality: 'unknown', providerUsedMicroUsd: null };
}

/** Upload a secret-bearing VERSION only. Caller must explicitly authorize remote staging. */
export async function stageKeyVersion(service, secret, spawnProcess = spawn, { timeoutMs = 30_000, terminationWaitMs = 2000 } = {}) {
  const name = Object.hasOwn(keyNames, service) ? keyNames[service] : null;
  if (!name || !validCredential(service, secret) ||
    !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000 ||
    !Number.isSafeInteger(terminationWaitMs) || terminationWaitMs < 1 || terminationWaitMs > 2000) throw new Error('invalid-key');
  const args = [resolve(root, 'workers/oak-agent/node_modules/wrangler/bin/wrangler.js'), 'versions', 'secret', 'put', name,
    '--config', resolve(root, 'workers/oak-agent/wrangler.hosted.jsonc'), '--name', 'oak-agent'];
  return new Promise((yes, no) => {
    const child = spawnProcess(process.execPath, args, { cwd: root, detached: true, stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' } });
    let safeVersion = null, pending = '', ended = false, stopping = false, cleanupTimer;
    const terminate = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } };
    const finish = (error, termination = 'confirmed') => {
      if (ended) return; ended = true; clearTimeout(timer); clearTimeout(cleanupTimer); pending = '';
      if (error) { const failure = new Error('secret-version-staging-failed');
        failure.remoteOutcome = 'unknown'; failure.termination = termination; no(failure); }
      else yes({ staged: true, deployed: false, secretName: name, versionId: safeVersion, verificationRequired: true });
    };
    const stop = () => {
      if (ended || stopping) return; stopping = true;
      cleanupTimer = setTimeout(() => finish(true, 'unknown'), terminationWaitMs);
      terminate();
    };
    const timer = setTimeout(stop, timeoutMs);
    child.stdout.on('data', chunk => {
      // Emit only a UUID from the documented success line. Discard every other byte.
      pending = (pending + chunk.toString()).slice(-4096);
      const match = pending.match(/Created version ([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}) with secret /i);
      if (match) safeVersion = match[1].toLowerCase();
    });
    child.on('error', stop);
    child.on('close', code => finish(stopping || code !== 0 || safeVersion === null));
    child.stdin.on('error', stop);
    child.stdin.end(`${secret}\n`);
  });
}

async function readSecret() {
  if (process.stdin.isTTY) throw new Error('secret-stdin-required');
  let value = '';
  for await (const chunk of process.stdin) { value += chunk; if (Buffer.byteLength(value) > 4098) throw new Error('invalid-key'); }
  return value.replace(/\r?\n$/, '');
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (command === '--help' || !command) {
    console.log(`status <origin> <private-state.json> [used-percent=80]
stage-key <model|resend|exa|deepgram> <reviewed-input.json> <new-candidate.json> --stage-version
prepare-account-switch <model|exa|deepgram> <prior-evidence.json> <reviewed-new-account-intent.json> <new-private-candidate.json>
prepare-monitoring <model|exa|deepgram> <current-config.json> <owner-provider-observations.json> <new-private-receipt.json>
Monitoring reads the selected key from stdin. Exa/Deepgram use their existing evidence config. Model current-config JSON contains schemaVersion=1, purpose=owner-provider-selection, OWNER_OPENROUTER_ACCOUNT_ID, OWNER_OPENROUTER_WORKSPACE_ID (string or null), OWNER_GOOGLE_BILLING_ACCOUNT_ID, OWNER_GOOGLE_VERTEX_PROJECT_ID, and sponsorLedgerActor=sponsor-v1.
Monitoring observations bind only to that selected account/project/key. OpenRouter key allowance and Google Vertex provider credit remain separate; each receipt writes disabled owner-only preparation, never runtime selection or activation.
Model/Resend stage input: strict schemaVersion=1, purpose=key-version-staging, service, revision, accountId, sourceReceiptSha256, previousVersionId (UUID or null). This is a staging intent, not runtime evidence.
Model account-switch intent: schemaVersion=1, purpose=manual-account-switch, service=model, reviewedAt, credentialSha256 (SHA-256 of stdin key), priorAccount={accountId,revision,sourceReceiptSha256,keySha256,quotaActor:sponsor-v1}, selectedAccount={accountId}, googleVertex={provider:google-vertex,projectId}, sourceReceipt={service:model,accountId,sha256,observedAt}. Use an existing local model stage-key candidate as prior evidence so the credential reuse check has a prior key hash.
Exa/Deepgram account-switch intents retain their existing schema. All credentials use stdin only. Switch preparation writes one exclusive 0600 local candidate and makes no provider, storage, staging, deployment, activation, allowance-reset or account-creation call.
An OpenRouter key change does not change Google Vertex BYOK, its project or its credits, and does not reset the sponsor-v1 budget. Remaining model qualification: OpenRouter account/key/route/plan/credits/no-paid controls; separately selected Google Vertex BYOK provider/project/billing/credits/key authorization; retained sponsor-v1 budget, usage, incidents and holds; current source-bound privacy/account qualification. New-account qualification remains pending and provider balances stay unknown.`); return;
  }
  if (command === 'status' && rest.length >= 2 && rest.length <= 3) {
    const [origin, statePath, threshold = '80'] = rest, thresholdPercent = Number(threshold);
    if (!Number.isFinite(thresholdPercent) || thresholdPercent <= 0 || thresholdPercent >= 100) throw new Error('invalid-threshold');
    const lock = await open(`${statePath}.lock`, 'wx', 0o600);
    const temporary = `${statePath}.${process.pid}.tmp`;
    try {
      let previous;
      try { previous = await boundedJson(statePath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const statuses = await pollStatuses(origin), state = nextNotices(previous, statuses, thresholdPercent);
      await writeFile(temporary, `${JSON.stringify({ ...state, notices: undefined })}\n`, { flag: 'wx', mode: 0o600 });
      await rename(temporary, statePath);
      console.log(JSON.stringify({ statuses, notices: state.notices, notificationMode: 'this-invocation-only', providerBalance: 'not-inferred' }, null, 2));
    } finally { await lock.close(); await unlink(`${statePath}.lock`); await unlink(temporary).catch(() => {}); }
    return;
  }
  if (command === 'prepare-monitoring' && rest.length === 4) {
    const [service, configPath, observationsPath, receiptPath] = rest;
    if (!receiptPath.endsWith('.json')) throw new Error('json-file-required');
    const secret = await readSecret(), currentConfig = await boundedJson(configPath), observations = await boundedJson(observationsPath);
    const candidate = await monitoringCandidate(service, currentConfig, observations, secret);
    await writeFile(receiptPath, `${JSON.stringify(candidate, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ status: monitoringPreparationStatus, service, qualification: 'pending' }));
    return;
  }
  if (command === 'prepare-account-switch' && rest.length === 4) {
    const [service, evidencePath, intentPath, candidatePath] = rest;
    if (!candidatePath.endsWith('.json')) throw new Error('json-file-required');
    const secret = await readSecret(), prior = await boundedJson(evidencePath), intent = await boundedJson(intentPath);
    const candidate = accountSwitchCandidate(service, prior, intent, secret);
    await writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    // Fixed allowlisted status only. Private identifiers, digests and inputs stay in the file.
    console.log(JSON.stringify({ status: preparedAccountSwitchStatus, service, qualification: 'pending',
      ...(candidate.remainingQualification ? { remainingQualification: candidate.remainingQualification } : {}) }));
    return;
  }
  if (command === 'stage-key' && rest.length === 4 && rest[3] === '--stage-version') {
    const [service, evidencePath, candidatePath] = rest;
    if (!candidatePath.endsWith('.json')) throw new Error('json-file-required');
    const secret = await readSecret(), candidate = rotationCandidate(service, await boundedJson(evidencePath), secret);
    // Exclusive new file: never overwrite live bindings or a reviewed account receipt.
    await writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(await stageKeyVersion(service, secret)));
    return;
  }
  throw new Error('invalid-command');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    if (error.remoteOutcome === 'unknown') console.error(`Version staging outcome is unknown. Inspect Worker versions before retrying. Local subprocess termination: ${error.termination === 'confirmed' ? 'confirmed' : 'unknown'}.`);
    else console.error('Operation failed. No raw service or secret output is printed. Check command inputs and reviewed account configuration.');
    process.exitCode = 1;
  });
}
