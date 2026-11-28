import { oakOpenUINames } from '../verdict.ts';

type Citation = Readonly<{ documentId: string }>;
type Claim = Readonly<{ text: string; citations?: readonly Citation[] }>;
type CardOf = ((claim: Claim & { citations: readonly Citation[] }) => Readonly<{ card?: Readonly<{ stack?: readonly string[] }> }> | null | undefined) | undefined;

/** Ticket 310: a Stack's chips, read by Stack.tsx, StackMap.tsx and the pairwise printer: the tools the cited pages list that some claim names, in the pages' order, once each. */
export function oakStackChips(claims: readonly Claim[], cardOf: CardOf) {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const claim of claims) for (const citation of claim.citations ?? []) {
    const source = cardOf?.({ ...claim, citations: [citation] });
    for (const item of source?.card?.stack ?? []) {
      const folded = item.toLowerCase();
      if (seen.has(folded) || !claims.some(other => oakOpenUINames(other.text, item))) continue;
      seen.add(folded);
      items.push(item);
    }
  }
  return items;
}
