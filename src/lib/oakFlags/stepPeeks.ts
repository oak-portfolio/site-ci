/** Ticket 26: a finished search, read or web step offers "What I read", the passages or pages it read. Ticket 36 flips it. */
export const oakStepPeeks = true;
export const oakGalleryKey = "stepPeeks";

let forced: boolean | null = null;

export function forceOakStepPeeks(on: boolean | null) {
  forced = on;
}

export const oakStepPeeksOn = () => forced ?? oakStepPeeks;
