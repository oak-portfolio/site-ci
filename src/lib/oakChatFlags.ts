/** Review-set switches for the Oak AI Agent chat. Each flips only by a deploy after Oak's yes in the review sitting (D3). */

/** PR 1e: Edit on every earlier question, not only the newest. Stays off (D3, 2026-11-04) until its 390 tooltip and jump-button overlaps are fixed. */
export const oakEditEarlierQuestions = false;

export type OakFlagSet = { editEarlier: boolean };
let forced: Partial<OakFlagSet> = {};

/** Gallery only: one dev state pins the switches it names on or off without changing the shipped constants; the rest keep them. */
export function forceOakFlags(partial: Partial<OakFlagSet>) {
  forced = partial;
}

export const oakEditEarlierOn = () => forced.editEarlier ?? oakEditEarlierQuestions;
