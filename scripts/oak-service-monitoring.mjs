/** Local owner-only binding of provider observations to the selected service config.
 * This prepares a disabled receipt. It does not contact providers or alter ledgers.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ordinaryInferenceKeySchema } from '../packages/oak-agent-contracts/src/funding.ts';
import { providerAccountObservationsSchema } from '../packages/oak-agent-contracts/src/owner-account-observations.ts';
import { projectOwnerProviderObservationReceipts, parseOwnerProviderObservationReceipts } from '../workers/oak-agent/src/owner/provider-accounts.ts';
import { parseResearchEvidence, researchQuotaName, validResearchCredential } from '../workers/oak-agent/src/research/evidence.ts';
import { parseVoiceEvidence, validVoiceCredential, voiceQuotaName } from '../workers/oak-agent/src/voice/evidence.ts';

const timestamp = z.number().int().min(0).max(8_640_000_000_000_000);
const identity = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const modelSelectionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  purpose: z.literal('owner-provider-selection'),
  OWNER_OPENROUTER_ACCOUNT_ID: identity,
  OWNER_OPENROUTER_WORKSPACE_ID: identity.nullable(),
  OWNER_GOOGLE_BILLING_ACCOUNT_ID: identity,
  OWNER_GOOGLE_VERTEX_PROJECT_ID: identity,
  sponsorLedgerActor: z.literal('sponsor-v1'),
});

const servicePolicy = {
  model: { service: 'model-generation', providers: ['openrouter', 'google-vertex'], actor: 'sponsor-v1',
    keyName: 'SPONSOR_OPENROUTER_KEY' },
  exa: { service: 'public-research', providers: ['exa'] },
  deepgram: { service: 'transcription', providers: ['deepgram'] },
};

const digest = value => createHash('sha256').update(value).digest('hex');
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const fail = () => { throw new Error('invalid-monitoring-input'); };

function noCredentialFields(value) {
  if (Array.isArray(value)) return value.every(noCredentialFields);
  if (!value || typeof value !== 'object') return true;
  return Object.entries(value).every(([key, child]) => {
    if (/^(?:api.?key|secret|token|credential)$/i.test(key)) return false;
    return noCredentialFields(child);
  });
}

/** Stands in for the Key queue in Node: the projection reads each account record through it, as the Worker does (P08-G9). */
const recordQueue = (provider, record) => ({ idFromName: name => name,
  get: () => ({ resolve: async asked => ({ slotId: null, key: null, record: asked === provider ? record : null }) }) });

function selectedBinding(service, currentConfig, secret) {
  const keySha256 = digest(secret);
  if (service === 'model') {
    const parsed = modelSelectionSchema.safeParse(currentConfig);
    if (!parsed.success || !ordinaryInferenceKeySchema.safeParse(secret).success) fail();
    const value = parsed.data;
    return { env: {
      SPONSOR_OPENROUTER_KEY: secret,
      OWNER_OPENROUTER_ACCOUNT_ID: value.OWNER_OPENROUTER_ACCOUNT_ID,
      OWNER_OPENROUTER_WORKSPACE_ID: value.OWNER_OPENROUTER_WORKSPACE_ID ?? undefined,
      OWNER_GOOGLE_BILLING_ACCOUNT_ID: value.OWNER_GOOGLE_BILLING_ACCOUNT_ID,
      OWNER_GOOGLE_VERTEX_PROJECT_ID: value.OWNER_GOOGLE_VERTEX_PROJECT_ID,
    }, selectedConfig: { service: 'model-generation',
      openrouter: { accountId: value.OWNER_OPENROUTER_ACCOUNT_ID, workspaceId: value.OWNER_OPENROUTER_WORKSPACE_ID },
      googleVertex: { billingAccountId: value.OWNER_GOOGLE_BILLING_ACCOUNT_ID, projectId: value.OWNER_GOOGLE_VERTEX_PROJECT_ID },
      sponsorLedgerActor: 'sponsor-v1' }, privateCredential: { secretName: 'SPONSOR_OPENROUTER_KEY', keySha256 },
      historicalActor: 'sponsor-v1' };
  }

  if (service === 'exa') {
    const evidence = parseResearchEvidence(currentConfig);
    if (!evidence || !validResearchCredential(secret) || evidence.keyId !== keySha256) fail();
    return { env: { EXA_API_KEY: secret, PROVIDER_KEYS: recordQueue("exa", JSON.stringify(evidence)) },
      selectedConfig: { service: 'public-research', accountId: evidence.accountId, projectId: null,
        revision: evidence.revision, sourceReceiptSha256: evidence.sourceReceiptSha256 },
      privateCredential: { secretName: 'EXA_API_KEY', keySha256 },
      historicalActor: researchQuotaName(evidence.accountId) };
  }

  if (service === 'deepgram') {
    const evidence = parseVoiceEvidence(currentConfig);
    if (!evidence || !validVoiceCredential(secret) || evidence.keySha256 !== keySha256) fail();
    return { env: { DEEPGRAM_API_KEY: secret, PROVIDER_KEYS: recordQueue("deepgram", JSON.stringify(evidence)) },
      selectedConfig: { service: 'transcription', accountId: evidence.accountId, projectId: evidence.projectId,
        revision: evidence.revision, sourceReceiptSha256: evidence.sourceReceiptSha256 },
      privateCredential: { secretName: 'DEEPGRAM_API_KEY', keySha256 },
      historicalActor: voiceQuotaName(evidence.accountId) };
  }

  fail();
}

/**
 * Validate a fresh owner receipt against the selected current key and account config.
 * Unknown provider balance and expiry remain unknown; no application budget is copied.
 */
export async function monitoringCandidate(service, currentConfig, receiptInput, secret, now = Date.now()) {
  const policy = Object.hasOwn(servicePolicy, service) ? servicePolicy[service] : null;
  if (!policy || typeof secret !== 'string' || /[\u0000-\u001f\u007f]/.test(secret) ||
    !timestamp.safeParse(now).success || !noCredentialFields(currentConfig) || !noCredentialFields(receiptInput) ||
    canonical({ currentConfig, receiptInput }).includes(secret)) fail();

  const parsedReceipts = parseOwnerProviderObservationReceipts(receiptInput);
  if (!parsedReceipts || parsedReceipts.observations.length !== policy.providers.length ||
    parsedReceipts.observations.some(row => !policy.providers.includes(row.provider)) ||
    policy.providers.some(provider => !parsedReceipts.observations.some(row => row.provider === provider))) fail();
  const binding = selectedBinding(service, currentConfig, secret);
  const selectedByProvider = service === 'model' ? {
    openrouter: { accountId: binding.selectedConfig.openrouter.accountId, projectId: binding.selectedConfig.openrouter.workspaceId },
    'google-vertex': { accountId: binding.selectedConfig.googleVertex.billingAccountId, projectId: binding.selectedConfig.googleVertex.projectId },
  } : {
    [policy.providers[0]]: { accountId: binding.selectedConfig.accountId ?? binding.selectedConfig.organizationId,
      projectId: binding.selectedConfig.projectId },
  };
  for (const row of parsedReceipts.observations) {
    const selected = selectedByProvider[row.provider];
    if (!selected || row.accountId !== selected.accountId || row.projectId !== selected.projectId ||
      row.credentialSha256 !== binding.privateCredential.keySha256 || row.observedAt > now || row.validUntil <= now) fail();
  }
  const env = { ...binding.env, OWNER_PROVIDER_OBSERVATIONS_JSON: JSON.stringify(parsedReceipts) };
  const providerAccounts = await projectOwnerProviderObservationReceipts(env, parsedReceipts, now);
  const validated = providerAccountObservationsSchema.safeParse(providerAccounts);
  if (!validated.success) fail();
  const rows = validated.data.filter(row => row.service === policy.service)
    .sort((a, b) => policy.providers.indexOf(a.provider) - policy.providers.indexOf(b.provider));
  if (rows.length !== policy.providers.length || rows.some((row, index) => row.provider !== policy.providers[index])) fail();

  const sourceReceiptSha256 = digest(canonical(parsedReceipts));
  const selectedConfigSha256 = digest(canonical(currentConfig));
  const candidate = {
    schemaVersion: 1,
    purpose: 'disabled-owner-account-monitoring',
    service,
    preparedAt: now,
    selectedConfig: binding.selectedConfig,
    selectedConfigSha256,
    sourceReceiptSha256,
    privateCredential: binding.privateCredential,
    providerAccounts: rows,
    historicalState: {
      ledgerActor: binding.historicalActor,
      incidentActor: 'owner-alerts-v1',
      action: 'retain-existing-account-history',
      storageRead: false,
      storageWritten: false,
      usageReset: false,
      holdsMigrated: false,
      newBudgetCreated: false,
    },
    qualificationStatus: 'pending',
    enabled: false,
    deployed: false,
    activationAuthorized: false,
    providerCallsMade: false,
    accountCreated: false,
    paidFallback: false,
    automaticRefill: false,
  };
  if (JSON.stringify(candidate).includes(secret)) fail();
  return candidate;
}

export const monitoringPreparationStatus = 'prepared-disabled';
