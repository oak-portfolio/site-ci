import { z } from 'zod';
import { serviceStatusSchema } from './service-status-schema.ts';

export const fundingOpaqueSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const fundingTabSchema = z.uuid();
export const visitorFundingSessionSchema = z.strictObject({ tabId: fundingTabSchema, handle: fundingOpaqueSchema });
export type VisitorFundingSession = z.infer<typeof visitorFundingSessionSchema>;
// Bounds and control-character rejection only. Provider metadata proves the key type.
export const ordinaryInferenceKeySchema = z.string().min(8).max(512).regex(/^[^\s\u0000-\u001f\u007f]+$/u);
export const FUNDING_CONNECT_MAX_AGE_MS = 30_000;
export const FUNDING_CONTENT_GUARD_HEADER = 'X-Oak-Funding-Guard';
export const FUNDING_SAFETY_ACK_HEADER = 'X-Oak-Funding-Safety';
const requestFreshness = { issuedAt: z.number().int().nonnegative(), deadline: z.number().int().nonnegative() };
export const fundingRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('oauth-start'), tabId: fundingTabSchema, operationId: fundingOpaqueSchema, sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), ...requestFreshness }),
  z.strictObject({ action: z.literal('oauth-complete'), tabId: fundingTabSchema, nonce: fundingOpaqueSchema,
    code: z.string().min(1).max(512).regex(/^[^\s\u0000-\u001f\u007f]+$/u) }),
  z.strictObject({ action: z.literal('manual'), tabId: fundingTabSchema, key: ordinaryInferenceKeySchema,
    operationId: fundingOpaqueSchema, sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), ...requestFreshness }),
  z.strictObject({ action: z.literal('status'), tabId: fundingTabSchema, handle: fundingOpaqueSchema }),
  z.strictObject({ action: z.literal('cancel'), tabId: fundingTabSchema, operationId: fundingOpaqueSchema, nonce: fundingOpaqueSchema.optional() }),
  z.strictObject({ action: z.literal('disconnect'), tabId: fundingTabSchema, handle: fundingOpaqueSchema }),
]);
export type FundingRequest = z.infer<typeof fundingRequestSchema>;
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
export const fundingAllowanceSchema = z.strictObject({
  limitMicroUsd: amount, usedMicroUsd: amount, remainingMicroUsd: amount, checkedAt: z.number().int().nonnegative(),
});
export type FundingAllowance = z.infer<typeof fundingAllowanceSchema>;
// Public terms and the effective local reservation bound. No credential, quote or provider invoice.
export const modelReadingPolicySchema = z.strictObject({
  revision: z.string().regex(/^[A-Za-z0-9._:-]{1,240}$/),
  model: z.string().min(1).max(120), recipient: z.string().min(1).max(160),
  processing: z.string().min(1).max(500), retention: z.string().min(1).max(500),
  loopReserveMicroUsd: z.number().int().positive().max(3_000_000),
});
export const modelReadingAcknowledgementSchema = modelReadingPolicySchema.pick({ revision: true, loopReserveMicroUsd: true });
export type ModelReadingPolicy = z.infer<typeof modelReadingPolicySchema>;
export type ModelReadingAcknowledgement = z.infer<typeof modelReadingAcknowledgementSchema>;
export const fundingStatusSchema = z.strictObject({
  state: z.enum(['connected', 'disconnected', 'expired']), method: z.enum(['oauth', 'manual']).nullable(),
  expiresAt: z.number().int().nonnegative().nullable(), keyAllowance: fundingAllowanceSchema.nullable(),
  providerBalance: z.literal('unknown'), serviceStatus: serviceStatusSchema,
  modelReadingPolicy: modelReadingPolicySchema.optional(),
});
export type FundingStatus = z.infer<typeof fundingStatusSchema>;
export const fundingResponseSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('oauth'), nonce: fundingOpaqueSchema, expiresAt: z.number().int().nonnegative(),
    authorizationUrl: z.string().max(2048).refine(value => {
      try { const url = new URL(value); return url.origin === 'https://openrouter.ai' && url.pathname === '/auth' && !url.username && !url.password && !url.hash; }
      catch { return false; }
    }) }),
  z.strictObject({ kind: z.literal('connection'), session: visitorFundingSessionSchema, status: fundingStatusSchema }),
  z.strictObject({ kind: z.literal('status'), status: fundingStatusSchema }),
  z.strictObject({ kind: z.literal('closed') }),
]);
export type FundingResponse = z.infer<typeof fundingResponseSchema>;
export const fundingOAuthReadySchema = z.strictObject({ type: z.literal('oak-funding-ready'), challenge: fundingOpaqueSchema });
export const fundingOAuthBindSchema = z.strictObject({ type: z.literal('oak-funding-bind'), challenge: fundingOpaqueSchema, nonce: fundingOpaqueSchema });
export const fundingCallbackSchema = z.union([
  z.strictObject({ type: z.literal('oak-funding-callback'), nonce: fundingOpaqueSchema,
    code: z.string().min(1).max(512).regex(/^[^\s\u0000-\u001f\u007f]+$/u) }),
  z.strictObject({ type: z.literal('oak-funding-callback'), nonce: fundingOpaqueSchema, error: z.enum(['cancelled', 'unavailable']) }),
]);
export const openRouterCreditsUrl = 'https://openrouter.ai/settings/credits';
export const openRouterKeysUrl = 'https://openrouter.ai/settings/keys';
