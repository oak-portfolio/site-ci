import { z } from 'zod';
import { oakAudienceSchema } from '../transport.ts';

export const oakRequestKinds = ['overview', 'project-deep-dive', 'how-it-works', 'compare-projects', 'timeline', 'skills', 'stack',
  'results-metrics', 'who-did-what', 'tradeoffs', 'method-process', 'lessons', 'employer-experience'] as const;
export type OakRequestKind = typeof oakRequestKinds[number];

/**
 * A fragment's `plan` field: the request kinds the component serves and its slot in each, what counts its items, and the
 * purposes it leads for. `replaces` (ticket 37): older components this one stands in for in any plan that has both, so a
 * kind plans one of them; with this one untaught the older one plans as before. `npm run openui:check` checks every fragment
 * against it, so this file never imports the registry it checks (a bad rule there would block regenerating it).
 */
export const oakPlanRuleSchema = z.strictObject({
  in: z.partialRecord(z.enum(oakRequestKinds), z.number().int().min(1).max(5)),
  count: z.enum(['hits', 'projects', 'roles', 'documents']).optional(),
  leadsFor: z.array(oakAudienceSchema).optional(),
  replaces: z.array(z.string().regex(/^[A-Z][A-Za-z]{0,39}$/)).optional(),
});
export type OakPlanRule = z.infer<typeof oakPlanRuleSchema>;
