import { z } from "zod";
import { documentOperationSchema, documentOutputSchema, preflightReceiptSchema } from "./documents.ts";
import { visitorFundingSessionSchema } from "./funding.ts";

const amount = z.number().int().nonnegative().max(1_000_000);
const revision = z.string().regex(/^[a-zA-Z0-9._:-]{1,120}$/);
const disclosureText = z.string().trim().min(1).max(2000).regex(/^[^\u0000-\u001f\u007f]+$/u);
/** Required server-reviewed public terms. No inferred recipient, retention or parser defaults. */
export const ocrDisclosureSchema = z.strictObject({
  processor: disclosureText,
  recipient: disclosureText,
  parser: disclosureText,
  processing: disclosureText,
  retention: disclosureText,
});
/** No engine or price defaults. This is server policy, never browser authority. */
export const ocrPolicySchema = z.strictObject({
  revision,
  termsRevision: revision,
  engine: revision,
  disclosure: ocrDisclosureSchema,
  parserBoundMicroUsd: amount,
  modelBoundMicroUsd: amount,
  quoteLifetimeMs: z.number().int().min(1).max(30_000),
  principalDailyCap: z.number().int().min(1).max(10),
  globalDailyCap: z.number().int().min(1).max(100),
  concurrencyCap: z.number().int().min(1).max(4),
});
export type OcrPolicy = z.infer<typeof ocrPolicySchema>;
export const ocrConfirmationSchema = z.strictObject({
  policyRevision: revision,
  termsRevision: revision,
  parserBoundMicroUsd: amount,
  modelBoundMicroUsd: amount,
  totalBoundMicroUsd: amount,
});
export const ocrQuoteRequestSchema = z.strictObject({
  receipt: preflightReceiptSchema,
  funding: visitorFundingSessionSchema,
  visitorCapMicroUsd: amount,
});
export const ocrConfirmRequestSchema = z.strictObject({
  quoteId: z.uuid(),
  funding: visitorFundingSessionSchema,
  receipt: preflightReceiptSchema,
  originalBase64: z
    .string()
    .min(4)
    .max(6_666_668)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  confirmation: ocrConfirmationSchema,
});
export const ocrControlRequestSchema = z.strictObject({ quoteId: z.uuid(), funding: visitorFundingSessionSchema.optional() });
export type OcrConfirmation = z.infer<typeof ocrConfirmationSchema>;
export const ocrQuoteSchema = ocrConfirmationSchema.extend({
  quoteId: z.uuid(),
  expiresAt: z.number().int().nonnegative(),
  chargeEvidence: z.literal('estimate-only'),
  funding: z.literal('visitor'),
  disclosure: ocrDisclosureSchema,
  scope: z.strictObject({ coverage: z.literal('whole-document'), pages: z.number().int().min(1).max(20),
    originalBytes: z.number().int().min(1).max(5_000_000) }),
  source: documentOperationSchema.extend({ originalSha256: z.string().regex(/^[a-f0-9]{64}$/),
    receiptId: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
}).strict().refine(value => value.totalBoundMicroUsd === value.parserBoundMicroUsd + value.modelBoundMicroUsd);
export type OcrQuote = z.infer<typeof ocrQuoteSchema>;
/** Observed account/upstream fields are not a parser/model settlement or an inclusive total. */
export const ocrAccountingObservationSchema = z.strictObject({
  generationId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional(),
  reportedOpenRouterChargeMicroUsd: z.number().int().nonnegative().max(1_000_000_000).optional(),
  upstreamInferenceChargeMicroUsd: z.number().int().nonnegative().max(1_000_000_000).optional(),
  parserInclusion: z.literal('unknown'), upstreamInclusion: z.literal('separate'), settlement: z.literal('unknown'),
});
export type OcrAccountingObservation = z.infer<typeof ocrAccountingObservationSchema>;
/** Qualified provider-reported accounting, not a provider invoice or a fee breakdown. */
export const ocrSettlementReceiptSchema = z.strictObject({
  source: z.literal('openrouter-generation-v1'),
  generationId: z.string().max(128).regex(/^gen-[0-9A-Za-z-]+$/),
  parserInclusion: z.literal('included-in-openrouter-account-charge'),
  parserPlatformBreakdown: z.literal('unknown'),
  openRouterChargeMicroUsd: z.number().int().nonnegative().max(1_000_000_000),
  isByok: z.boolean(),
  upstreamInferenceChargeMicroUsd: z.number().int().nonnegative().max(1_000_000_000).nullable(),
  totalChargeMicroUsd: z.number().int().nonnegative().max(2_000_000_000),
  settlement: z.literal('provider-reported'),
}).refine(value => value.isByok
  ? value.upstreamInferenceChargeMicroUsd !== null && value.totalChargeMicroUsd === value.openRouterChargeMicroUsd + value.upstreamInferenceChargeMicroUsd
  : value.upstreamInferenceChargeMicroUsd === null && value.totalChargeMicroUsd === value.openRouterChargeMicroUsd);
export type OcrSettlementReceipt = z.infer<typeof ocrSettlementReceiptSchema>;
export const ocrStatusSchema = z.strictObject({
  quoteId: z.uuid(), state: z.enum(['quoted', 'cancelled', 'dispatching', 'exposure-held', 'denied', 'settled']),
  parserHeldMicroUsd: amount, modelHeldMicroUsd: amount,
  actualCharge: z.enum(['unknown', 'not-dispatched', 'verified']), retryAllowed: z.literal(false),
  accounting: ocrAccountingObservationSchema.optional(),
  settlementReceipt: ocrSettlementReceiptSchema.optional(),
}).refine(value => {
  if (value.state === 'settled') return value.actualCharge === 'verified' && value.parserHeldMicroUsd === 0 && value.modelHeldMicroUsd === 0 &&
    value.settlementReceipt !== undefined && value.accounting?.generationId === value.settlementReceipt.generationId;
  if (value.settlementReceipt !== undefined) return false;
  return value.state === 'dispatching' || value.state === 'exposure-held' ? value.actualCharge === 'unknown' :
    value.actualCharge === 'not-dispatched' && value.parserHeldMicroUsd === 0 && value.modelHeldMicroUsd === 0;
});
export type OcrStatus = z.infer<typeof ocrStatusSchema>;
export const ocrResultSchema = z.strictObject({
  quoteId: z.uuid(), output: documentOutputSchema, status: ocrStatusSchema,
  inference: z.enum(['completed', 'failed']),
}).superRefine((value, context) => {
  if (value.status.quoteId !== value.quoteId || !['unknown', 'verified'].includes(value.status.actualCharge) ||
      value.output.ocrSource?.quoteId !== value.quoteId || value.output.sourceMapping !== 'openrouter-file-annotation-v1')
    context.addIssue({ code: 'custom', message: 'Invalid OCR result binding.' });
});
export type OcrResult = z.infer<typeof ocrResultSchema>;
/** Legacy/status-only replies cannot imply a successful extraction. */
export const ocrConfirmResponseSchema = z.union([ocrResultSchema, ocrStatusSchema]);
