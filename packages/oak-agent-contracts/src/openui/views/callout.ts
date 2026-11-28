/** Ticket 305: a Callout kind's icon and the word it shows beside it, read by Callout.tsx and the pairwise printer. */
export const OAK_CALLOUT_KINDS = {
  held: { icon: 'lock', word: 'Not published yet' },
  now: { icon: 'clock', word: 'In progress' },
  off: { icon: 'viewOff', word: 'Off the record' },
  guard: { icon: 'securityCheck', word: 'Outside what I answer' },
} as const;
export type OakCalloutKind = keyof typeof OAK_CALLOUT_KINDS;

/** A cited record's facts as a Callout reads them, or null while they are not loaded for the answer's revision. */
export type OakCalloutFacts = Readonly<{ kind: string; articleStatus?: string; current?: boolean }> | null;
type Claim = Readonly<{ citations?: readonly Readonly<{ documentId: string }>[] }>;

/** Ticket 310: a record's facts as a Callout reads them: a work page's status, a career entry with no end date is current. */
export const oakCalloutFacts = (record: Readonly<{ kind: string; articleStatus?: string; dateEnd?: string }> | null | undefined): OakCalloutFacts =>
  !record ? null : record.kind === 'work' ? { kind: 'work', articleStatus: record.articleStatus } : { kind: record.kind, current: record.kind === 'experience' && !record.dateEnd };

/** A banner states a fact, so it shows only when the cited record backs it; guard speaks for the agent, not about Steve. */
export function oakCalloutBacked(kind: OakCalloutKind, claim: Claim | undefined, factsOf: (documentId: string) => OakCalloutFacts) {
  if (!claim) return false;
  if (kind === 'guard') return true;
  const cited = claim.citations ?? [];
  if (kind === 'off') return cited.length === 0;
  return cited.some(citation => {
    const facts = factsOf(citation.documentId);
    if (!facts) return false;
    return facts.kind === 'work' ? facts.articleStatus === 'in-progress-stub' : kind === 'now' && facts.kind === 'experience' && !!facts.current;
  });
}

/** The word a backed kind shows, or null when the Callout is the plain info note. */
export const oakCalloutWord = (kind: string | undefined, claim: Claim | undefined, factsOf: (documentId: string) => OakCalloutFacts) =>
  kind && kind in OAK_CALLOUT_KINDS && oakCalloutBacked(kind as OakCalloutKind, claim, factsOf) ? OAK_CALLOUT_KINDS[kind as OakCalloutKind].word : null;
