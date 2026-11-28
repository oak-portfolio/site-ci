import { prop, type OakClaimFacts, type OakOpenUINode } from './node.ts';

/** Compare: the two column names when every paired row cites the same two card pages in the same order (R27h review), else
 * null, so a swapped or third-page row never sits under the wrong name and a page without a card names no column. */
export function oakOpenUICompareView(rows: readonly OakOpenUINode[], facts: OakClaimFacts) {
  const cardOf = (id: unknown) => typeof id === 'string' && id ? facts(id)?.card ?? null : null;
  const pairs = rows.filter(row => prop(row, 'claim') && prop(row, 'also')).map(row => [cardOf(prop(row, 'claim')), cardOf(prop(row, 'also'))] as const);
  const [first] = pairs;
  const columns = first && first[0] && first[1] && first[0].page !== first[1].page &&
    pairs.every(([a, b]) => a?.page === first[0]!.page && b?.page === first[1]!.page) ? [first[0].name, first[1].name] as const : null;
  return { columns };
}
