/** Ticket 169: a plan's Project and Role blocks draw their record cards (title, cover, role, dates) when the plan arrives; off, they stay ghosts until the answer lands. */
export const oakRecordCardsAtPlan = true;
export const oakGalleryKey = "recordCardsAtPlan";

let forced: boolean | null = null;

export function forceOakRecordCardsAtPlan(on: boolean | null) {
  forced = on;
}

export const oakRecordCardsAtPlanOn = () => forced ?? oakRecordCardsAtPlan;
