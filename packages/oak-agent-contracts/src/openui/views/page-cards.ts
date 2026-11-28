/** Ticket 305: how PageCards groups its claims into pages and titles each card, read by PageCardsView.tsx and the pairwise printer. */
type Cited = Readonly<{ citations?: readonly Readonly<{ documentId: string }>[] }>;
type Titled = Readonly<{ url: string; title: string; card?: Readonly<{ title?: string }> | null }>;
export type OakPageGroup<C, S> = { documentId: string; url: string; source: S; claims: C[] };

/** One page per first citation, in claim order; a claim with no citation or no card for its page is a stray, drawn as its Source card. */
export function oakPageCardGroups<C extends Cited, S extends Titled>(ids: readonly string[], claimOf: (id: string) => C | undefined, sourceOf: (claim: C) => S | null | undefined) {
  const pages: OakPageGroup<C, S>[] = [], strays: string[] = [];
  for (const id of ids) {
    const claim = claimOf(id);
    const citation = claim?.citations?.[0];
    const source = claim ? sourceOf(claim) : null;
    if (!claim || !citation || !source) { strays.push(id); continue; }
    const page = pages.find(item => item.documentId === citation.documentId);
    if (page) page.claims.push(claim);
    else pages.push({ documentId: citation.documentId, url: source.url, source, claims: [claim] });
  }
  return { pages, strays };
}

/** A page card's title: the page's card title, else its label up to the first colon. */
export const oakPageCardTitle = (source: Titled) => source.card?.title ?? source.title.split(":")[0]!.trim();
