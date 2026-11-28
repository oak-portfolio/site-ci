import { z } from 'zod';
import { ownerIncidentSchema } from '../owner-services.ts';

/** The paged owner read over the stored alert history (ticket 65, 500 rows kept), newest first, 50 per page. */
export const ownerAlertHistoryPath = '/api/oak/owner/alerts/history';
export const OWNER_ALERT_HISTORY_PAGE_LIMIT = 50;

export const ownerAlertHistorySchema = z.strictObject({
  service: z.literal('oak-owner-alert-history-v1'),
  checkedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  // A held retrieval read stays marked held; it is never shown as a settled reading.
  items: z.array(z.strictObject({ incident: ownerIncidentSchema, held: z.boolean() })).max(OWNER_ALERT_HISTORY_PAGE_LIMIT),
  nextCursor: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).nullable(),
});
export type OwnerAlertHistory = z.infer<typeof ownerAlertHistorySchema>;
