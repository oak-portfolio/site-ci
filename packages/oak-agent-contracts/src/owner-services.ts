import { z } from 'zod';
import { serviceStatusSchema } from './service-status-schema.ts';
import { ownerAccountAlertConditionSchema, ownerAccountAlertContextSchema, ownerAccountExpiryWarningMsSchema,
  ownerProviderAccountServiceByProvider, providerAccountObservationsSchema } from './owner-account-observations.ts';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();

export const ownerAlertConditionSchema = z.enum(['disabled', 'ready', 'near-limit', 'exhausted', 'blocked', 'failure', 'stale', 'unknown']);
export const ownerAlertDeliveryStateSchema = z.enum(['queued', 'sending', 'accepted', 'provider-delivered', 'inbox-observed', 'rate-limited', 'quota-exhausted', 'failed', 'outcome-unknown']);
export const ownerServiceNames = ['model-generation', 'diagnostic-traces', 'transcription', 'public-research', 'document-extraction', 'document-ocr', 'error-telemetry', 'product-analytics', 'semantic-retrieval'] as const;
export const ownerServiceNameSchema = z.enum(ownerServiceNames);

export const ownerServiceRecordSchema = z.strictObject({
  status: serviceStatusSchema,
  condition: ownerAlertConditionSchema,
});
const ownerServiceRowsSchema = z.array(ownerServiceRecordSchema).length(ownerServiceNames.length).refine(rows => {
  const names = new Set(rows.map(row => row.status.service));
  return names.size === ownerServiceNames.length && ownerServiceNames.every(name => names.has(name));
}, 'Every owner service must appear exactly once');
export const ownerStatusSnapshotSchema = z.strictObject({
  checkedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  services: ownerServiceRowsSchema,
  providerAccounts: providerAccountObservationsSchema.optional(),
});
export const ownerIncidentKindSchema = z.enum(['condition-change', 'retrieval-generation-change', 'provider-account-change']);
export const ownerIncidentConditionSchema = z.union([ownerAlertConditionSchema, ownerAccountAlertConditionSchema]);
export const ownerIncidentSchema = z.strictObject({
  kind: ownerIncidentKindSchema.optional(),
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  service: ownerServiceNameSchema,
  from: ownerIncidentConditionSchema,
  to: ownerIncidentConditionSchema,
  account: ownerAccountAlertContextSchema.optional(),
  budgetBasis: z.literal('local-budget').optional(),
  transition: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  thresholdPercent: z.number().int().min(1).max(99).nullable(),
  configurationRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  delivery: ownerAlertDeliveryStateSchema,
  attempts: z.number().int().min(0).max(3),
  lastAttemptAt: count,
  acceptedAt: count,
  providerDeliveredAt: count,
  inboxObservedAt: count,
}).superRefine((value, ctx) => {
  if (value.budgetBasis && (value.account || value.kind === 'provider-account-change' || value.kind === 'retrieval-generation-change' ||
    !(value.to === 'near-limit' || value.to === 'exhausted' || value.to === 'ready' && ['near-limit', 'exhausted'].includes(value.from))))
    ctx.addIssue({ code: 'custom', message: 'App budget context requires a service capacity change or its recovery' });
  if (value.kind === 'retrieval-generation-change' && (value.service !== 'semantic-retrieval' || value.from !== value.to || value.to === 'disabled'))
    ctx.addIssue({ code: 'custom', message: 'Generation incident must be semantic and preserve condition' });
  if (value.kind === 'provider-account-change') {
    const account = value.account;
    if (!account || ownerProviderAccountServiceByProvider[account.provider] !== value.service || value.from === value.to)
      ctx.addIssue({ code: 'custom', message: 'Account incident requires a matching provider and changed condition' });
    else {
      const allowed = account.category === 'credit' ? ['ready', 'near-limit', 'swap-now', 'exhausted'] : ['ready', 'near-expiry', 'swap-now', 'expired'];
      if (!allowed.includes(value.from) || !allowed.includes(value.to) ||
        account.category !== 'credit' && value.to !== 'ready' && account.expiresAt === null)
        ctx.addIssue({ code: 'custom', message: 'Account alert condition must match its credit or expiry category' });
    }
  } else if (value.account || !ownerAlertConditionSchema.safeParse(value.from).success || !ownerAlertConditionSchema.safeParse(value.to).success)
    ctx.addIssue({ code: 'custom', message: 'Service incidents cannot carry account conditions or identity' });
});
export const ownerEmailQuotaRecheckStateSchema = z.enum(['never', 'checking', 'verified', 'permission-denied', 'rate-limited', 'unavailable', 'deadline', 'cancelled', 'superseded']);
export type OwnerEmailQuotaRecheckState = z.infer<typeof ownerEmailQuotaRecheckStateSchema>;

export const ownerServicesViewSchema = z.strictObject({
  schemaVersion: z.literal(1),
  checkedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  modelReset: z.strictObject({ period: z.literal('utc-month'), startsAt: count, nextAt: count,
    heldCarryOver: z.literal(true), keyRotationResetsUsage: z.literal(false) }),
  alerting: z.strictObject({
    featureEnabled: z.boolean(),
    started: z.boolean(),
    senderReady: z.boolean(),
    emailQuota: z.strictObject({
      dailyLimit: z.literal(100), monthlyLimit: z.literal(3000),
      dailyUsed: count, monthlyUsed: count, observedAt: count,
      hold: z.enum(['none', 'daily', 'monthly', 'unknown']), pauseUntil: count,
    }).optional(),
    emailQuotaRecheck: z.strictObject({ state: ownerEmailQuotaRecheckStateSchema, attemptedAt: count, checkedAt: count, nextAllowedAt: count }).optional(),
    thresholdPercent: z.number().int().min(1).max(99).nullable(),
    expiryWarningMs: ownerAccountExpiryWarningMsSchema.optional(),
    configurationRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    droppedTransitions: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    lastPollAt: count,
    nextPollAt: count,
    incidents: z.array(ownerIncidentSchema).max(20),
  }),
  services: ownerServiceRowsSchema,
  providerAccounts: providerAccountObservationsSchema.optional(),
});

export const ownerServicesActionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('start'), thresholdPercent: z.number().int().min(1).max(99) }),
  z.strictObject({ action: z.literal('configure'), thresholdPercent: z.number().int().min(1).max(99) }),
  z.strictObject({ action: z.literal('stop') }),
  z.strictObject({ action: z.literal('recheck-email-quota') }),
]);

export type OwnerServiceName = z.infer<typeof ownerServiceNameSchema>;
export type OwnerAlertCondition = z.infer<typeof ownerAlertConditionSchema>;
export type OwnerAlertDeliveryState = z.infer<typeof ownerAlertDeliveryStateSchema>;
export type OwnerServiceRecord = z.infer<typeof ownerServiceRecordSchema>;
export type OwnerStatusSnapshotDto = z.infer<typeof ownerStatusSnapshotSchema>;
export type OwnerIncident = z.infer<typeof ownerIncidentSchema>;
export type OwnerServicesView = z.infer<typeof ownerServicesViewSchema>;
export type OwnerServicesAction = z.infer<typeof ownerServicesActionSchema>;
