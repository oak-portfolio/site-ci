/** Ticket 17: a planned answer draws its lead slot, then one ghost per planned block, until the layout fills or drops it. Ticket 36 flips it. */
export const oakPlanFirst = false;
export const oakGalleryKey = "planFirst";

let forced: boolean | null = null;

export function forceOakPlanFirst(on: boolean | null) {
  forced = on;
}

export const oakPlanFirstOn = () => forced ?? oakPlanFirst;
