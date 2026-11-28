/** Ticket 305: the words a record card's row shows, read once for the renderer (Project, Role, Source) and the pairwise printer. */
const OAK_JOB_WORD = /\b(?:engineer|designer|developer|manager|lead|founder|co-founder|assistant|consultant|architect|scientist|analyst|intern|owner|specialist|director|researcher|marketer|strategist|officer|head|president|cto|ceo|coo|cpo|vp|chief|partner|advisor|mentor|teacher|instructor|editor|writer|producer)\b/i;
const OAK_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DOT = ' \u00b7 ';

/** R21: every comma part of a job title is its own chip; a qualifier with no job word joins the title before it unless it leads. */
export const oakRoleTitles = (title: string | undefined) => (title ?? '').split(/,\s+/).map(item => item.trim()).filter(Boolean)
  .reduce<string[]>((list, part) => list.length && !OAK_JOB_WORD.test(part) ? [...list.slice(0, -1), `${list.at(-1)}${DOT}${part}`] : [...list, part], []);

/** "Feb 2026 - May 2026" -> "4 mos", "Jan 2024 - Jan 2025" -> "1 yr 1 mo": arithmetic on the page's own dates, or null. */
export function oakRoleDuration(period: string | undefined) {
  const parts = period?.split(/\s+[-\u2013\u2014]\s+|\s+to\s+/i);
  if (!parts || parts.length !== 2) return null;
  const at = (text: string) => { const m = text.trim().match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/); const month = m ? OAK_MONTHS.indexOf(m[1]!.toLowerCase()) : -1;
    return m && month >= 0 ? Number(m[2]) * 12 + month : null; };
  const start = at(parts[0]!), end = at(parts[1]!);
  if (start === null || end === null || end < start) return null;
  const months = end - start + 1, years = Math.floor(months / 12), rest = months % 12;
  return [years ? `${years} yr${years > 1 ? 's' : ''}` : '', rest ? `${rest} mo${rest > 1 ? 's' : ''}` : ''].filter(Boolean).join(' ');
}

/** R21: a role's years, "2026", "2024 \u2013 2025" or "2026 \u2013 Now"; a period it cannot read as years shows as the page wrote it. */
export function oakRoleYears(period: string | undefined) {
  const parts = period?.split(/\s+[-\u2013\u2014]\s+|\s+to\s+/i);
  if (!parts?.length) return null;
  const year = (text: string) => /present|now/i.test(text) ? 'Now' : text.match(/\b(19|20)\d\d\b/)?.[0] ?? null;
  const start = year(parts[0]!), end = parts[1] ? year(parts[1]) : null;
  if (!start) return period?.trim() || null;
  if (parts.length > 1 && !end) return period!.trim();
  return !end || end === start ? start : `${start} \u2013 ${end}`;
}

export type OakRecordKind = 'project' | 'role' | 'source';
/** A card's record fields: a Project's title, role and period; a Role's employer (`place`), job title and period; a Source's host and title. */
export type OakRecordFacts = Readonly<{ title?: string; place?: string; role?: string; period?: string; host?: string; stacked?: boolean; dated?: boolean }>;
/** `name` heads the row unless `named` is false (the answer said it), `meta` (its `fields` on one line) follows it, and a Role lists `titles` as chips.
 * `bare` (tickets 307 and 327): the card draws no name line at all, so its cover or tile is the link. */
export type OakRecordRow = Readonly<{ name: string; fields: string[]; meta: string; titles: string[]; named: boolean; bare: boolean }>;

/**
 * Ticket 214: a row drops each field the answer already says (`said`), and its name stays when nothing else is left.
 * Ticket 295: beside a Stack (`stacked`) a Project or Role row is its name alone.
 * Ticket 327: so is one under a question the Worker marks not dated (`dated` false); absent, the row is as before.
 * Ticket 307: such a short row whose name the answer says is bare.
 */
export function oakRecordRow(kind: OakRecordKind, facts: OakRecordFacts, said: (field: string) => boolean): OakRecordRow {
  if (kind === 'source') {
    const host = facts.host ?? '', title = facts.title ?? host;
    const fields = title === host ? [] : [title];
    return { name: host, fields, meta: fields.join(DOT), titles: [], named: true, bare: false };
  }
  const short = Boolean(facts.stacked || facts.dated === false);
  if (kind === 'role') {
    const name = facts.place ?? facts.title ?? '';
    const titles = short || (facts.role && said(facts.role)) ? [] : oakRoleTitles(facts.role).filter(item => !said(item));
    const meta = short ? '' : [oakRoleYears(facts.period), oakRoleDuration(facts.period)].filter(Boolean).join(DOT);
    return { name, fields: meta ? [meta] : [], meta, titles, named: !said(name) || !meta, bare: short && said(name) };
  }
  const name = facts.title ?? '';
  const fields = short ? [] : [facts.role, facts.period].filter((field): field is string => !!field && !said(field));
  return { name, fields, meta: fields.join(DOT), titles: [], named: !said(name) || !fields.length, bare: short && said(name) };
}

/** The row as one printed line, in the order the card draws it. */
export const oakRecordLine = (row: OakRecordRow, kind?: OakRecordKind) => kind === 'source' ? [row.name, row.meta].filter(Boolean).join(': ') : [row.named ? row.name : '', ...row.fields, ...row.titles].filter(Boolean).join('; ');
