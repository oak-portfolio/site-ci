/** Ticket 60 (ktrade): Points in decisions mode lists the cited record's ownership.oak lines and links its tradeoffs section; off, it is the plain Points list. */
export const oakKindDecisions = false;
export const oakGalleryKey = "kindDecisions";

let forced: boolean | null = null;

export function forceOakKindDecisions(on: boolean | null) {
  forced = on;
}

export const oakKindDecisionsOn = () => forced ?? oakKindDecisions;
