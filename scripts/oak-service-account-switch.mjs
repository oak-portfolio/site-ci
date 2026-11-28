/** Local disabled intent only. Never reads or writes provider/account storage. */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseResearchEvidence, researchQuotaName, validResearchCredential,
  RESEARCH_SETTINGS_MAX_AGE_MS } from '../workers/oak-agent/src/research/evidence.ts';
import { parseVoiceEvidence, voiceQuotaName, validVoiceCredential,
  voiceSettingsMaxAge } from '../workers/oak-agent/src/voice/evidence.ts';
import { ordinaryInferenceKeySchema } from '../packages/oak-agent-contracts/src/funding.ts';

export const preparedAccountSwitchStatus = 'prepared-disabled';
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.number().int().min(0).max(8_640_000_000_000_000);
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const exaId = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
  .transform(value => value.toLowerCase());
const deepgramId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const modelId = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const common = { schemaVersion: z.literal(1), purpose: z.literal('manual-account-switch'), reviewedAt: timestamp };
const account = service => service === 'exa' ? { accountId: exaId } : { accountId: deepgramId, projectId: deepgramId };
const schema = service => z.strictObject({ ...common, service: z.literal(service),
  priorAccount: z.strictObject({ ...account(service), revision, sourceReceiptSha256: sha256,
    quotaActor: z.string().max(150) }),
  selectedAccount: z.strictObject(account(service)),
  sourceReceipt: z.strictObject({ ...account(service), sha256, observedAt: timestamp }) });

// Local stage candidates provide a historical credential fingerprint for the
// reuse check. They are structural bindings only, not runtime evidence.
const modelPrior = z.object({ schemaVersion: z.literal(1), purpose: z.literal('key-version-staging'),
  service: z.literal('model'), revision, accountId: modelId, sourceReceiptSha256: sha256, keySha256: sha256,
  secretName: z.literal('SPONSOR_OPENROUTER_KEY'), stableActor: z.literal('sponsor-v1'), deployed: z.literal(false),
  activationAuthorized: z.literal(false), verificationRequired: z.literal(true), keyRotationResetsUsage: z.literal(false),
  preservesHistoricalHolds: z.literal(true) });
const modelSwitch = z.strictObject({ ...common, service: z.literal('model'), credentialSha256: sha256,
  priorAccount: z.strictObject({ accountId: modelId, revision, sourceReceiptSha256: sha256, keySha256: sha256,
    quotaActor: z.literal('sponsor-v1') }),
  selectedAccount: z.strictObject({ accountId: modelId }),
  googleVertex: z.strictObject({ provider: z.literal('google-vertex'), projectId: modelId }),
  sourceReceipt: z.strictObject({ service: z.literal('model'), accountId: modelId, sha256, observedAt: timestamp }) });

const extensionPolicy = {
  model: { actor: 'sponsor-v1', incidentService: 'model-generation', secretName: 'SPONSOR_OPENROUTER_KEY',
    prior: modelPrior, intent: modelSwitch, maxAge: 300_000,
    remainingQualification: ['OpenRouter account, key, model route, plan, current credits and no-paid controls',
      'Google Vertex BYOK provider, project, billing, current credits and key authorization',
      'sponsor-v1 budget, existing usage, incidents and uncertain holds remain attached without reset',
      'source-bound current privacy and account qualification'] },
};

/** Prior evidence is structural/historical, not a fresh ledger or qualification read. */
export function accountSwitchCandidate(service, priorInput, input, secret, now = Date.now()) {
  const fail = () => { throw new Error('invalid-account-switch-input'); };
  if (!['exa', 'deepgram', 'model'].includes(service) || typeof secret !== 'string' ||
    !Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000) fail();
  if (service === 'model') {
    const policy = extensionPolicy[service], parsed = policy.intent.safeParse(input), priorParsed = policy.prior.safeParse(priorInput);
    const validKey = ordinaryInferenceKeySchema.safeParse(secret).success;
    if (!parsed.success || !priorParsed.success || !validKey || /[\u0000-\u001f\u007f]/.test(secret) ||
      JSON.stringify({ priorInput, input }).includes(secret)) fail();
    const intent = parsed.data, prior = priorParsed.data, ref = intent.priorAccount, selected = intent.selectedAccount,
      receipt = intent.sourceReceipt, digest = createHash('sha256').update(secret).digest('hex');
    if (ref.accountId !== prior.accountId || ref.revision !== prior.revision ||
      ref.sourceReceiptSha256 !== prior.sourceReceiptSha256 || ref.keySha256 !== prior.keySha256 ||
      ref.quotaActor !== policy.actor || intent.credentialSha256 !== digest || digest === prior.keySha256 ||
      selected.accountId.toLowerCase() === prior.accountId.toLowerCase() ||
      receipt.service !== service || receipt.accountId !== selected.accountId || receipt.sha256 === prior.sourceReceiptSha256 ||
      receipt.observedAt > intent.reviewedAt || intent.reviewedAt > now || now - receipt.observedAt > policy.maxAge) fail();

    const qualification = { priorBinding: 'unknown', accountBinding: 'unknown', keyBinding: 'unknown',
      settings: 'unknown', providerUsage: 'unknown', providerBalance: 'unknown', freeCredit: 'unknown',
      usagePeriod: 'unknown', plan: 'unknown', tariff: 'unknown', privacy: 'unknown', freeOnlyEligibility: 'unknown',
      hardStop: 'unknown' };
    Object.assign(qualification, { openRouterAccount: 'unknown', openRouterKey: 'unknown',
      openRouterModelRoute: 'unknown', openRouterPlan: 'unknown', openRouterCredits: 'unknown',
      googleVertexProvider: 'unknown', googleVertexProject: 'unknown', googleVertexBilling: 'unknown',
      googleVertexCredits: 'unknown', googleVertexByokAuthorization: 'unknown', sponsorBudget: 'unknown' });
    const actor = policy.actor;
    const historicalState = { quotaActor: actor, usageActor: actor, uncertainHoldActor: actor,
      incidentActor: 'owner-alerts-v1', incidentService: policy.incidentService, action: 'retain-with-prior-account',
      storageRead: false, storageWritten: false, usageReset: false, holdsMigrated: false,
      ...(service === 'model' ? { sponsorLedgerActor: 'sponsor-v1' } : {}) };
    const candidate = { schemaVersion: 1, purpose: 'disabled-account-switch-staging', service, preparedAt: now,
      reviewedAt: intent.reviewedAt, priorAccount: { ...ref,
        evidenceSha256: createHash('sha256').update(JSON.stringify(prior)).digest('hex'),
        evidenceBasis: 'local-key-staging-candidate-unverified' },
      selectedAccount: { ...selected }, ...(service === 'model' ? { googleVertex: { ...intent.googleVertex } } : {}),
      sourceReceipt: { ...receipt }, privateCredential: { secretName: policy.secretName, keySha256: digest },
      historicalState, qualificationStatus: 'pending', qualification,
      remainingQualification: [...policy.remainingQualification],
      ...(service === 'model' ? { providerStatePolicy: { sponsorLedgerActor: 'sponsor-v1',
        keyChangeResetsSponsorBudget: false, openRouterKeyChangesGoogleVertexByok: false,
        openRouterKeyChangeResetsGoogleVertexCredits: false } } : {}),
      stableActor: 'sponsor-v1', budgetLedgerActor: 'sponsor-v1',
      enabled: false, deployed: false, activationAuthorized: false, verificationRequired: true,
      paidFallback: false, automaticRefill: false };
    if (JSON.stringify(candidate).includes(secret) || preparedAccountSwitchStatus.includes(secret)) fail();
    return candidate;
  }
  const validKey = service === 'exa' ? validResearchCredential : validVoiceCredential;
  if (!validKey(secret) || /[\u0000-\u001f\u007f]/.test(secret)) fail();
  // Reject attempts to put the supplied plaintext in even otherwise valid identity/receipt fields.
  if (JSON.stringify({ priorInput, input }).includes(secret)) fail();
  const parsed = schema(service).safeParse(input);
  const prior = service === 'exa' ? parseResearchEvidence(priorInput) : parseVoiceEvidence(priorInput);
  if (!parsed.success || !prior) fail();
  const intent = parsed.data, ref = intent.priorAccount, selected = intent.selectedAccount, receipt = intent.sourceReceipt;
  const quotaActor = service === 'exa' ? researchQuotaName(prior.accountId) : voiceQuotaName(prior.accountId);
  const maxAge = service === 'exa' ? RESEARCH_SETTINGS_MAX_AGE_MS : voiceSettingsMaxAge;
  if (ref.accountId !== prior.accountId || ref.revision !== prior.revision ||
    ref.sourceReceiptSha256 !== prior.sourceReceiptSha256 || ref.quotaActor !== quotaActor ||
    service === 'deepgram' && ref.projectId !== prior.projectId ||
    selected.accountId.toLowerCase() === prior.accountId.toLowerCase() ||
    service === 'deepgram' && selected.projectId.toLowerCase() === prior.projectId.toLowerCase() ||
    receipt.accountId !== selected.accountId || service === 'deepgram' && receipt.projectId !== selected.projectId ||
    receipt.sha256 === prior.sourceReceiptSha256 ||
    receipt.observedAt > intent.reviewedAt || intent.reviewedAt > now || now - receipt.observedAt > maxAge) fail();
  const keySha256 = createHash('sha256').update(secret).digest('hex');
  if (keySha256 === (service === 'exa' ? prior.keyId : prior.keySha256)) fail();
  const candidate = { schemaVersion: 1, purpose: 'disabled-account-switch-staging', service, preparedAt: now,
    reviewedAt: intent.reviewedAt, priorAccount: { ...ref,
      evidenceSha256: createHash('sha256').update(JSON.stringify(prior)).digest('hex') },
    selectedAccount: { ...selected }, sourceReceipt: { ...receipt },
    privateCredential: { secretName: service === 'exa' ? 'EXA_API_KEY' : 'DEEPGRAM_API_KEY', keySha256 },
    historicalState: { quotaActor, usageActor: quotaActor, uncertainHoldActor: quotaActor,
      incidentActor: 'owner-alerts-v1', incidentService: service === 'exa' ? 'public-research' : 'transcription',
      sponsorLedgerActor: 'sponsor-v1', action: 'retain-with-prior-account',
      storageRead: false, storageWritten: false, usageReset: false, holdsMigrated: false },
    qualificationStatus: 'pending', qualification: { accountBinding: 'unknown', keyBinding: 'unknown',
      settings: 'unknown', providerUsage: 'unknown', providerBalance: 'unknown', freeCredit: 'unknown',
      usagePeriod: 'unknown', plan: 'unknown', tariff: 'unknown', privacy: 'unknown',
      freeOnlyEligibility: 'unknown', hardStop: 'unknown' },
    enabled: false, deployed: false, activationAuthorized: false, verificationRequired: true,
    paidFallback: false, automaticRefill: false };
  if (JSON.stringify(candidate).includes(secret) || preparedAccountSwitchStatus.includes(secret)) fail();
  return candidate;
}
