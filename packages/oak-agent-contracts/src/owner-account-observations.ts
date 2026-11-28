import { z } from 'zod';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000);
export const providerAccountServiceSchema = z.enum(['model-generation', 'public-research', 'transcription', 'document-ocr']);
export const providerAccountProviderSchema = z.enum(['exa', 'deepgram', 'openrouter', 'google-vertex']);
/** Logical account/project identity. It is never derived from an API key. */
export const providerAccountScopeSchema = z.string().regex(/^[a-f0-9]{64}$/);
/** Opaque current-key binding, derived with a domain and logical account scope. Never a key fingerprint. */
export const providerAccountCredentialScopeSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const providerAccountCreditBasisSchema = z.enum(['provider-credit', 'key-allowance']);
const evidence = z.enum(['verified', 'estimated', 'stale', 'unknown']);
const knownExpiryEvidence = z.enum(['verified', 'estimated', 'stale']);
export const providerAccountExpirySchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('unknown'), expiresAt: z.null(), evidence: z.literal('unknown'), observedAt: timestamp.nullable() }),
  z.strictObject({ state: z.literal('non-expiring'), expiresAt: z.null(), evidence: knownExpiryEvidence, observedAt: timestamp }),
  z.strictObject({ state: z.literal('dated'), expiresAt: timestamp, evidence: knownExpiryEvidence, observedAt: timestamp }),
]);

export const ownerProviderAccountServiceByProvider = { exa: 'public-research', deepgram: 'transcription',
  openrouter: 'model-generation', 'google-vertex': 'model-generation' } as const;

/** Private owner-only observation. Provider credit, credential validity and eligibility are separate facts. */
export const providerAccountObservationSchema = z.strictObject({
  service: providerAccountServiceSchema,
  provider: providerAccountProviderSchema,
  scope: providerAccountScopeSchema,
  credentialScope: providerAccountCredentialScopeSchema.optional(),
  observedAt: timestamp.nullable(),
  evidence,
  credit: z.strictObject({ unit: z.enum(['micro-usd', 'audio-seconds', 'parser-credits']),
    basis: providerAccountCreditBasisSchema, limit: count.nullable(), remaining: count.nullable() }),
  creditExpiry: providerAccountExpirySchema,
  credentialExpiry: providerAccountExpirySchema,
  eligibilityExpiry: providerAccountExpirySchema,
}).superRefine((value, ctx) => {
  if (ownerProviderAccountServiceByProvider[value.provider] !== value.service)
    ctx.addIssue({ code: 'custom', path: ['service'], message: 'Provider must match its owner service' });
  if (value.credit.basis === 'key-allowance' && value.provider !== 'openrouter')
    ctx.addIssue({ code: 'custom', path: ['credit', 'basis'], message: 'Key allowance is an OpenRouter observation' });
  if (value.credit.limit !== null && value.credit.remaining !== null && value.credit.remaining > value.credit.limit)
    ctx.addIssue({ code: 'custom', path: ['credit', 'remaining'], message: 'Remaining cannot exceed a known limit' });
  if (value.evidence !== 'unknown' && value.observedAt === null)
    ctx.addIssue({ code: 'custom', path: ['observedAt'], message: 'Known evidence requires an observation time' });
});

export const providerAccountObservationsSchema = z.array(providerAccountObservationSchema).max(20).refine(rows => {
  const identities = new Set(rows.map(row => `${row.provider}/${row.scope}`));
  return identities.size === rows.length;
}, 'Provider account observations must be unique');

export const ownerAccountAlertCategorySchema = z.enum(['credit', 'credit-expiry', 'credential-expiry', 'eligibility-expiry']);
export const ownerAccountAlertConditionSchema = z.enum(['ready', 'near-limit', 'swap-now', 'exhausted', 'near-expiry', 'expired', 'stale', 'unknown']);
export const ownerAccountAlertContextSchema = z.strictObject({
  provider: providerAccountProviderSchema,
  scope: providerAccountScopeSchema,
  category: ownerAccountAlertCategorySchema,
  expiresAt: timestamp.nullable(),
  evidence,
  observedAt: timestamp.nullable(),
  creditBasis: providerAccountCreditBasisSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.category === 'credit' && (value.expiresAt !== null || value.creditBasis === undefined) ||
    value.category !== 'credit' && value.creditBasis !== undefined)
    ctx.addIssue({ code: 'custom', message: 'Credit and expiry alert context must stay separate' });
  if (value.creditBasis === 'key-allowance' && value.provider !== 'openrouter')
    ctx.addIssue({ code: 'custom', path: ['creditBasis'], message: 'Key allowance is an OpenRouter observation' });
  if (value.evidence !== 'unknown' && value.observedAt === null)
    ctx.addIssue({ code: 'custom', path: ['observedAt'], message: 'Known evidence requires an observation time' });
});

export const DEFAULT_OWNER_ACCOUNT_EXPIRY_WARNING_MS = 7 * 86_400_000;
export const MIN_OWNER_ACCOUNT_EXPIRY_WARNING_MS = 3_600_000;
export const MAX_OWNER_ACCOUNT_EXPIRY_WARNING_MS = 90 * 86_400_000;
export const ownerAccountExpiryWarningMsSchema = count.min(MIN_OWNER_ACCOUNT_EXPIRY_WARNING_MS).max(MAX_OWNER_ACCOUNT_EXPIRY_WARNING_MS);

export type ProviderAccountObservation = z.infer<typeof providerAccountObservationSchema>;
export type OwnerProviderAccountObservation = ProviderAccountObservation;
export type ProviderAccountExpiry = z.infer<typeof providerAccountExpirySchema>;
export type OwnerAccountAlertCategory = z.infer<typeof ownerAccountAlertCategorySchema>;
export type OwnerAccountAlertCondition = z.infer<typeof ownerAccountAlertConditionSchema>;
export type OwnerAccountAlertContext = z.infer<typeof ownerAccountAlertContextSchema>;
