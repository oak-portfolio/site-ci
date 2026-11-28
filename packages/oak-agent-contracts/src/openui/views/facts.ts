/**
 * Ticket 310: the card and record facts a page reads, projected once from the content. The page's server readers add
 * images, tints and publish-checked metrics on top; `npm run openui:prompt` writes these projections for the printer.
 */
export type OakArticleStatus = 'full' | 'in-progress-stub';
export type OakWorkSource = Readonly<{ slug: string; data: Readonly<{
  role: string; timeline: string; stack: readonly string[]; dek: string; articleStatus?: OakArticleStatus;
  datePublished: Date | string; dateUpdated?: Date | string;
  card: Readonly<{ title: string; category: string; badge?: string; statusLabel?: string }>;
  systemMap: readonly Readonly<{ label: string; description: string }>[];
}> }>;
export type OakTimelineSource = Readonly<{ id: string; date: string; place?: string;
  contexts: readonly Readonly<{ type: string; title: string; engagement?: string }>[];
  stack: readonly Readonly<{ items: readonly string[] }>[] }>;
export type OakLegacySource = Readonly<{ href: string; title: string }>;
export type OakFactSources = Readonly<{ work: readonly OakWorkSource[]; legacy: readonly OakLegacySource[]; timeline: readonly OakTimelineSource[] }>;

export type OakCardFacts = Readonly<{ kind: 'work' | 'role'; title?: string; role?: string; period?: string; place?: string; stack?: readonly string[] }>;
export type OakWorkTextFacts = Readonly<{ kind: 'work'; dek: string; category: string; badge?: string; articleStatus: OakArticleStatus; statusLabel?: string;
  datePublished: string; dateUpdated?: string; period?: string; systemMap: readonly Readonly<{ label: string; description: string }>[] }>;
export type OakExperienceTextFacts = Readonly<{ kind: 'experience'; engagement?: string; dateStart: string; dateEnd?: string; title: string }>;

/** A card's stack shows its first 8 tools. */
const CARD_STACK = 8;
export const oakCardKey = (url: string) => url.replace(/\/$/, '');
const workUrl = (slug: string) => `https://steveoak.com/work/${slug}/`;
const roleUrl = (id: string) => `https://steveoak.com/work#${id}`;
const roleTitle = (item: OakTimelineSource) => (item.contexts.find(context => context.type === 'employment') ?? item.contexts[0])?.title;

/** R16: each card's text facts keyed by canonical URL: a Work page's card title, role, period and stack; a legacy study's title; a role's title, period, place and stack. */
export function oakCardFactsFrom({ work, legacy, timeline }: OakFactSources): Record<string, OakCardFacts> {
  const cards: Record<string, OakCardFacts> = {};
  for (const { slug, data } of work)
    cards[oakCardKey(workUrl(slug))] = { kind: 'work', title: data.card.title, role: data.role, period: data.timeline, stack: data.stack.slice(0, CARD_STACK) };
  for (const study of legacy) cards[oakCardKey(study.href)] = { kind: 'work', title: study.title };
  for (const item of timeline)
    cards[oakCardKey(roleUrl(item.id))] = { kind: 'role', title: roleTitle(item), period: item.date, ...(item.place ? { place: item.place } : {}),
      stack: item.stack.flatMap(group => group.items).slice(0, CARD_STACK) };
  return cards;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "May 2026" to "2026-05"; anything else is unreadable. */
function month(text: string | undefined) {
  const [name, year, extra] = text?.trim().split(/\s+/) ?? [];
  const at = MONTHS.indexOf(name ?? '');
  return at >= 0 && /^\d{4}$/.test(year ?? '') && extra === undefined ? `${year}-${String(at + 1).padStart(2, '0')}` : undefined;
}
const day = (date: Date | string | undefined) => date === undefined ? undefined : new Date(date).toISOString().slice(0, 10);

/** A career entry's facts from its first employment context; none without a reviewed engagement or a readable date range. */
export function oakExperienceFacts(item: OakTimelineSource): OakExperienceTextFacts | undefined {
  const role = item.contexts.find(context => context.type === 'employment');
  const [start, end, extra] = item.date.split(' - ');
  const dateStart = month(start), dateEnd = end === 'Present' ? undefined : month(end);
  if (!role || !dateStart || extra !== undefined || (end !== 'Present' && !dateEnd)) return undefined;
  return { kind: 'experience', engagement: role.engagement, dateStart, ...(dateEnd ? { dateEnd } : {}), title: role.title };
}

/** A Work page's record facts that carry no image or publish check. */
export function oakWorkTextFacts({ data }: OakWorkSource): OakWorkTextFacts {
  return {
    kind: 'work', dek: data.dek, category: data.card.category,
    ...(data.card.badge ? { badge: data.card.badge } : {}),
    articleStatus: data.articleStatus ?? 'full',
    ...(data.card.statusLabel ? { statusLabel: data.card.statusLabel } : {}),
    datePublished: day(data.datePublished)!,
    ...(data.dateUpdated ? { dateUpdated: day(data.dateUpdated) } : {}),
    ...(data.timeline ? { period: data.timeline } : {}),
    systemMap: data.systemMap.map(({ label, description }) => ({ label, description })),
  };
}

/** The text record facts of every Work page and career entry, keyed by knowledge document id, kept to the `published` ids. */
export function oakRecordFactsFrom({ work, timeline }: Pick<OakFactSources, 'work' | 'timeline'>, published: ReadonlySet<string>) {
  const records: Record<string, OakWorkTextFacts | OakExperienceTextFacts> = {};
  for (const entry of work) if (published.has(`work:${entry.slug}`)) records[`work:${entry.slug}`] = oakWorkTextFacts(entry);
  for (const item of timeline) {
    const facts = oakExperienceFacts(item);
    if (facts && published.has(`experience:${item.id}`)) records[`experience:${item.id}`] = facts;
  }
  return records;
}
