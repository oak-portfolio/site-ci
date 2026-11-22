import { z } from 'zod';
import type { OakAudience } from '../transport.ts';
import { OAK_OPENUI_BLOCKS, OAK_PENDING_CAP } from './blocks.generated.ts';
import careerLinks from '../career-case-study-links.approved.json' with { type: 'json' };
import { oakPlanRuleSchema, type OakPlanRule, type OakRequestKind } from './plan-rule.ts';

/**
 * Q28 A (exploration ticket 24): app rules plan an answer's block kinds and item counts from the question's request kind and
 * the records search found, with no model call, so each block's ghost shows about a second in. The Worker decides the kind
 * once, beside the rest of its question route (ARCH@38); this module never classifies text. The layout call is not told the
 * plan; the client reconciles (it may drop or shorten a planned block, never add one ahead of it). Kinds follow the answer
 * taxonomy (exploration ticket 28); each component's fragment names the kinds it serves in its `plan` field (ARCH-REVIEW A5).
 */
export type OakPlanHit = Readonly<{ documentId: string }>;
/** Q37 A (ticket 30): a reviewed row ties a career entry to its case study; only `approved` rows are ever read. */
export type OakCareerLink = Readonly<{ entry: string; caseStudy: string; approved: boolean }>;
/** The case study an entry's approved link names, or null. The plan and the entry card read this one table. */
export function oakLinkedCaseStudy(documentId: string, links: readonly OakCareerLink[] = careerLinks.links) {
  return links.find(link => link.approved === true && link.entry === documentId)?.caseStudy ?? null;
}
type Found = Readonly<Record<NonNullable<OakPlanRule['count']>, number>>;

const RULES = new Map(Object.values(OAK_OPENUI_BLOCKS).flatMap(block => block.plan ? [[block.name, oakPlanRuleSchema.parse(block.plan)] as const] : []));

/** Main's lead-first order (O28 default): the written lead always takes the first slot. */
export const OAK_PLAN_LEAD = { kind: 'Prose', count: 1 } as const;
const OAK_PLAN_ITEM_CAP = Math.max(...Object.values(OAK_PENDING_CAP));
/** A container holds at most its pendingCap, a one-claim block one item; a list, or a component this build does not know, the largest cap. */
export function oakPlanItemCap(kind: string) {
  const block = OAK_OPENUI_BLOCKS[kind];
  return block?.pendingCap ?? (block?.claims === 'one' ? 1 : OAK_PLAN_ITEM_CAP);
}

/** Ticket 169: the record kind a card block draws at plan time, by the prefix of the documents it names. Ticket 221: an overview's ProjectWall draws its tiles. */
export const OAK_PLAN_RECORD_PREFIX: Readonly<Record<string, string>> = { Project: 'work:', Role: 'experience:', ProjectWall: 'work:' };
const planBlockSchema = z.strictObject({ kind: z.string().regex(/^[A-Z][A-Za-z]{0,39}$/), count: z.number().int().min(1),
  records: z.array(z.string().regex(/^(?:work|experience):[\w-]{1,120}$/)).min(1).optional() })
  .refine(block => block.count <= oakPlanItemCap(block.kind), 'count over the kind cap')
  .refine(block => !block.records || (block.records.length <= block.count && Object.hasOwn(OAK_PLAN_RECORD_PREFIX, block.kind) &&
    block.records.every(id => id.startsWith(OAK_PLAN_RECORD_PREFIX[block.kind]!))), 'records name only this card kind\'s documents, up to its count');
/**
 * The `data-plan` stream part: block kinds and item counts in order, no text. `record-only` (ticket 46): no layout call follows,
 * the client draws the record blocks. `records` (ticket 169): a Project or Role block's document ids from the first search, so the
 * client can draw those cards from the page's own record fields before any claim arrives.
 */
export const oakAnswerPlanSchema = z.strictObject({
  mode: z.literal('record-only').optional(),
  blocks: z.array(planBlockSchema).min(2).max(6)
    .refine(([lead]) => lead?.kind === OAK_PLAN_LEAD.kind && lead.count === OAK_PLAN_LEAD.count, 'the lead slot comes first'),
});
export type OakAnswerPlan = z.infer<typeof oakAnswerPlanSchema>;
export type OakPlanBlock = OakAnswerPlan['blocks'][number];

function foundIn(hits: readonly OakPlanHit[], links: readonly OakCareerLink[]): Found {
  const documents = new Set(hits.map(hit => hit.documentId));
  const withLinked = new Set(documents);
  for (const id of documents) { const linked = oakLinkedCaseStudy(id, links); if (linked) withLinked.add(linked); }
  const where = (prefix: string) => [...withLinked].filter(id => id.startsWith(prefix)).length;
  return { hits: hits.length, projects: where('work:'), roles: where('experience:'), documents: documents.size };
}

/** r12ord (Q34 A): blocks a component leads for the visitor's stated purpose move to the front; the lead never moves. */
export function oakPlanOrder<T extends Readonly<{ kind: string }>>(blocks: readonly T[], audience: OakAudience | undefined): T[] {
  const [lead, ...rest] = blocks;
  if (!lead || !audience) return [...blocks];
  const leads = (block: T) => RULES.get(block.kind)?.leadsFor?.includes(audience) ?? false;
  return [lead, ...rest.filter(leads), ...rest.filter(block => !leads(block))];
}

/** An ordered plan of 2 to 6 taught blocks for this request kind, or null when no rule plans it. Pure: no model call. */
export function oakPlanFor(kind: OakRequestKind | null, hits: readonly OakPlanHit[], audience: OakAudience | undefined, taught: readonly string[], links: readonly OakCareerLink[] = careerLinks.links): OakAnswerPlan | null {
  if (!kind || !taught.includes(OAK_PLAN_LEAD.kind)) return null;
  const found = foundIn(hits, links);
  const unlocked = hits.some(hit => oakLinkedCaseStudy(hit.documentId, links)) && taught.includes('Project') && found.projects > 0;
  const planned = [...RULES].flatMap(([name, rule]) => {
    const slot = Object.hasOwn(rule.in, kind) ? rule.in[kind] : name === 'Project' && unlocked ? 1 : undefined;
    const count = Math.min(rule.count ? found[rule.count] : 1, oakPlanItemCap(name));
    return slot && count > 0 && taught.includes(name) ? [{ name, slot, count }] : [];
  });
  const replaced = new Set(planned.flatMap(({ name }) => RULES.get(name)?.replaces ?? []));
  const kept = planned.filter(({ name }) => !replaced.has(name)).sort((a, b) => a.slot - b.slot || a.name.localeCompare(b.name));
  const blocks = oakPlanOrder([OAK_PLAN_LEAD, ...kept.map(({ name, count }) => ({ kind: name, count }))], audience).slice(0, 6);
  return blocks.length >= 2 ? { blocks } : null;
}
