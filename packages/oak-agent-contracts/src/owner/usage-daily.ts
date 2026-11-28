import { z } from 'zod';

/** The owner per-day usage read (ticket 64). Signed out, the Worker answers 403 owner-required. */
export const ownerUsageDailyPath = '/api/oak/owner/usage/daily';

const micro = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** Aggregates by UTC day only. Strict objects refuse any principal or per-visitor field. */
export const ownerUsageDailySchema = z.strictObject({
  service: z.literal('oak-owner-usage-daily-v1'),
  checkedAt: micro,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  days: z.array(z.strictObject({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    actualMicroUsd: micro,
    heldMicroUsd: micro,
  })).max(31),
  pace: z.strictObject({ dailyPoolMicroUsd: micro.nullable(), paceMicroUsd: micro.nullable() }),
  saver: z.strictObject({ state: z.enum(['off', 'on', 'unknown']), thresholdPercent: z.number().int().min(1).max(100).nullable() }),
  rereadBacklog: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
});
export type OwnerUsageDaily = z.infer<typeof ownerUsageDailySchema>;
