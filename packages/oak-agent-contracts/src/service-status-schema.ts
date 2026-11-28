import { z } from 'zod';
import { semanticRetrievalStatusSchema } from './semantic-retrieval-status.ts';
import type { ServiceStatus, VisitorPaidOcrStatus } from './service-status.ts';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
const quality = z.enum(['verified', 'estimated', 'stale', 'unknown']);
const admission = z.enum(['disabled', 'available', 'blocked', 'exhausted', 'failed']);
const failure = z.enum(['none', 'configuration', 'quota', 'rate', 'rate-or-quota-unknown', 'transport', 'deadline', 'storage', 'capture']);
export const visitorPaidOcrStatusSchema: z.ZodType<VisitorPaidOcrStatus> = z.strictObject({
  funding: z.literal('visitor'), unit: z.literal('micro-usd'),
  readState: z.enum(['verified', 'unavailable', 'deadline']),
  states: z.strictObject({ quoted: count, cancelled: count, dispatching: count, exposureHeld: count, denied: count, settled: count }),
  outcomes: z.strictObject({ completed: count, failed: count, timedOut: count, cancelled: count, denied: count, unclassified: count }),
  parserHeldMicroUsd: count, modelHeldMicroUsd: count, providerReportedMicroUsd: count,
  actualCharge: z.literal('unknown'), settlement: z.literal('unknown'), remainingMicroUsd: z.null(),
}).superRefine((value, ctx) => {
  const observations = [...Object.values(value.states), ...Object.values(value.outcomes), value.parserHeldMicroUsd, value.modelHeldMicroUsd, value.providerReportedMicroUsd];
  if (observations.some(observation => value.readState === 'verified' ? observation === null : observation !== null))
    ctx.addIssue({ code: 'custom', message: 'OCR aggregates require a verified local read', path: ['readState'] });
  if (value.readState === 'verified' && Object.values(value.states).reduce((sum: number, count) => sum + (count ?? 0), 0) !==
      Object.values(value.outcomes).reduce((sum: number, count) => sum + (count ?? 0), 0))
    ctx.addIssue({ code: 'custom', message: 'Every retained OCR operation requires one outcome classification', path: ['outcomes'] });
  if (value.readState === 'verified' && value.states.settled === 0 && value.providerReportedMicroUsd !== 0)
    ctx.addIssue({ code: 'custom', message: 'Provider-reported costs require settled OCR records', path: ['providerReportedMicroUsd'] });
});
export const serviceStatusSchema: z.ZodType<ServiceStatus> = z.strictObject({
  schemaVersion: z.literal(1),
  service: z.enum(['model-generation', 'diagnostic-traces', 'transcription', 'owner-alerts', 'public-research', 'document-extraction', 'document-ocr', 'error-telemetry', 'product-analytics', 'semantic-retrieval']),
  enabled: z.boolean(),
  admission,
  failure,
  admissionBasis: z.enum(['verified-provider', 'local-cap']).optional(),
  localBudget: z.strictObject({ limit: count, consumed: count.optional(), reserved: count, remainingBound: count }).optional(),
  evidence: z.strictObject({ settings: quality, providerUsage: quality, localReservations: quality }),
  allowance: z.strictObject({
    unit: z.enum(['micro-usd', 'root-traces', 'audio-seconds', 'emails', 'conversion-attempts', 'parser-credits', 'telemetry-events', 'embedding-milli-neurons']),
    limit: count, providerObserved: count, reserved: count, conservativeUsed: count, remainingBound: count,
    periodStart: count, periodEnd: count,
    reset: z.enum(['utc-calendar-month', 'utc-calendar-day', 'provider-reported', 'unknown']),
  }),
  semanticRetrieval: semanticRetrievalStatusSchema.optional(),
  documentExtraction: z.strictObject({ localInspection: z.strictObject({
    enabled: z.boolean(), admission, failure,
    attempts: count, accepted: count, receiptOnly: count, failed: count, timedOut: count,
    lastAttemptAt: count, lastSuccessAt: count,
    lastOutcome: z.enum(['none', 'in-progress', 'accepted', 'receipt-only', 'failed', 'timed-out', 'unknown']),
  }) }).optional(),
  documentOcr: z.strictObject({ visitorPaid: visitorPaidOcrStatusSchema }).optional(),
  health: z.strictObject({
    lastCheckAt: count, settingsObservedAt: count, usageObservedAt: count,
    lastAttemptAt: count, lastSuccessAt: count, accepted: count, failed: count, timedOut: count,
  }),
}).superRefine((value, ctx) => {
  if (value.documentOcr && value.service !== 'document-ocr')
    ctx.addIssue({ code: 'custom', message: 'Paid OCR detail belongs only to document OCR', path: ['documentOcr'] });
  if (value.documentExtraction && value.service !== 'document-extraction')
    ctx.addIssue({ code: 'custom', message: 'Local inspection belongs only to document extraction', path: ['documentExtraction'] });
  const localInspection = value.documentExtraction?.localInspection;
  if (localInspection) {
    const { attempts, accepted, receiptOnly, failed, timedOut } = localInspection;
    if (attempts !== null && accepted !== null && receiptOnly !== null && failed !== null && accepted + receiptOnly + failed > attempts)
      ctx.addIssue({ code: 'custom', message: 'Terminal inspections cannot exceed attempts', path: ['documentExtraction', 'localInspection'] });
    if (timedOut !== null && failed !== null && timedOut > failed)
      ctx.addIssue({ code: 'custom', message: 'Inspection timeouts are a subset of failures', path: ['documentExtraction', 'localInspection', 'timedOut'] });
  }
  const semantic = value.service === 'semantic-retrieval';
  // Document OCR reports Oak's scan budget in micro-USD; parser credits are its legacy unit.
  if (value.service === 'document-ocr' ? !['micro-usd', 'parser-credits'].includes(value.allowance.unit) : value.allowance.unit === 'parser-credits')
    ctx.addIssue({code:'custom',message:'Document OCR reports micro-USD (or legacy parser credits), which belong only to it',path:['allowance','unit']});
  if (semantic !== (value.semanticRetrieval !== undefined)) ctx.addIssue({ code: 'custom', message: 'Semantic detail belongs only to semantic retrieval', path: ['semanticRetrieval'] });
  if (semantic && (value.allowance.unit !== 'embedding-milli-neurons' || value.allowance.reset !== 'utc-calendar-day' || value.allowance.reserved !== null))
    ctx.addIssue({ code: 'custom', message: 'Semantic scalar is daily embedding, never reserved local usage', path: ['allowance'] });
  if (value.semanticRetrieval?.metering.basis === 'conditional-local-budget' && (value.evidence.providerUsage !== 'unknown' ||
    value.allowance.limit !== null || value.allowance.providerObserved !== null || value.allowance.conservativeUsed !== null ||
    value.allowance.remainingBound !== null || value.health.usageObservedAt !== null))
    ctx.addIssue({ code: 'custom', message: 'Local retrieval budget does not attest provider balance', path: ['allowance'] });
  if (!semantic && value.allowance.unit === 'embedding-milli-neurons') ctx.addIssue({ code: 'custom', message: 'Embedding unit belongs to semantic retrieval', path: ['allowance', 'unit'] });
});
