import { oakOpenUIProposalFor, type OakOpenUIProposal } from '../prompt-options.ts';

type CardClaim = { id: string; citations: readonly { documentId: string }[] };

const aboutOnePage = (claim: CardClaim | undefined): claim is CardClaim =>
  Boolean(claim?.citations.length) && claim!.citations.every(citation => citation.documentId === claim!.citations[0]!.documentId);

/** A card shows its first claim and folds the rest under one "n more" control (R21); every claim is still placed once. */
export function oakCardFold<T>(ids: readonly T[]) {
  return { shown: ids[0] ?? null, folded: ids.slice(1) };
}

/**
 * Ticket 227: what a Project or Role card owns, for the renderer (useCard) and the printer (arrangedView) alike. The lead is
 * the first claim that cites one page which has a card (`hasCard`: the page's record of this kind, on the answer's own
 * revision). The card owns every claim citing only that page (ticket 211: a claim citing more pages, even with this page
 * first, never sits under its title); `others` follow the card as plain points. With no lead, every claim is a plain point.
 */
export function oakCardView<C extends CardClaim>(ids: readonly string[], claimOf: (id: string) => C | undefined, hasCard: (claim: C) => boolean) {
  const lead = ids.map(claimOf).find((claim): claim is C => aboutOnePage(claim) && hasCard(claim)) ?? null;
  const page = lead?.citations[0]?.documentId ?? null;
  const own = lead ? ids.filter(id => { const claim = claimOf(id); return aboutOnePage(claim) && claim.citations[0]!.documentId === page; }) : [];
  return { lead, page, own, ...oakCardFold(own), others: ids.filter(id => !own.includes(id)) };
}

/** The proposal an arranged answer may show: the app's own next tool for this answer (Q04), or none. */
export function oakOpenUIProposalOf(nextTool: keyof typeof oakOpenUIProposalFor | null | undefined): OakOpenUIProposal | null {
  return nextTool ? oakOpenUIProposalFor[nextTool] : null;
}
