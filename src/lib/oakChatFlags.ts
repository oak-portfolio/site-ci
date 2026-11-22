/** Review-set switches for the Oak AI Agent chat. Each flips only by a deploy after Oak's yes in the review sitting (D3). */

/** PR 1b: Related questions move into an "Other ways to continue" drawer under the next-step card. On by Oak's D3 yes (2026-11-04). */
export const oakRelatedDrawer = true;

/** PR 1e: Explain simply joins Ask about this and Copy on selected words. On by Oak's D3 yes (2026-11-04). */
export const oakExplainSimply = true;
/** PR 1e: a summary line (goes to Steve, references, characters) before Open email draft, and a receipt after it. On by Oak's D3 yes (2026-11-04). */
export const oakBriefSummary = true;
/** PR 1e: Edit on every earlier question, not only the newest. Stays off (D3, 2026-11-04) until its 390 tooltip and jump-button overlaps are fixed. */
export const oakEditEarlierQuestions = false;

export type OakFlagSet = { relatedDrawer: boolean; explainSimply: boolean; briefSummary: boolean; editEarlier: boolean };
let forced: Partial<OakFlagSet> = {};

/** Gallery only: one dev state pins the switches it names on or off without changing the shipped constants; the rest keep them. */
export function forceOakFlags(partial: Partial<OakFlagSet>) {
  forced = partial;
}

export const oakRelatedDrawerOn = () => forced.relatedDrawer ?? oakRelatedDrawer;
export const oakExplainSimplyOn = () => forced.explainSimply ?? oakExplainSimply;
export const oakBriefSummaryOn = () => forced.briefSummary ?? oakBriefSummary;
export const oakEditEarlierOn = () => forced.editEarlier ?? oakEditEarlierQuestions;

/**
 * PR 1d: a pasted job post gets a "Compare a role" offer under the box. Not one of the four review-set behaviors (D3 says
 * everything else in scope ships on), and the offer only points at the existing Compare a role flow, so it ships on.
 */
export const oakComposerPasteOffer = true;

/** PR 1c and genui 11: the web research step and Steve's own search step name how many came back ("3 found", "5 passages"). Ships on (M5: a deploy can turn it off). */
export const oakResearchTally = true;
/** PR 1c: a stopped step offers the footer's whole-turn Retry or Continue. Ships on (M5: a deploy can turn it off). */
export const oakStepRetry = true;

/** Ticket 15: a Source card's picture sits whole over a blurred copy of itself, not cropped. Ships on (M5: a deploy can turn it off). */
export const oakSourceBackdrop = true;
/** Ticket 15: Stack and Project tool chips lead with the tool's bundled brand mark when the registry has one. Ships on (M5). */
export const oakToolMarks = true;
/** Ticket 15: a web research row with no site date says when Oak checked the page. Ships on (M5). */
export const oakWebRowChecked = true;

/**
 * Ticket 16: while a layout streams, a Stats, Compare or Timeline whose children have not arrived holds their place with
 * skeletons of the settled item's own shape. Ships on (M5: a deploy can turn it off).
 */
export const oakTypedSkeletons = true;
/** Ticket 16: the contact-brief proposal names the pages of this answer the brief can attach. Ships on (M5). */
export const oakProposalTopics = true;
