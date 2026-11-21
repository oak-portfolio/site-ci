/** Ticket 60 (kdoc): the document answer lists the questions its quotes leave open, from the private answer only; off, today's card. */
export const oakKindUnresolved = false;
export const oakGalleryKey = "kindUnresolved";

let forced: boolean | null = null;

export function forceOakKindUnresolved(on: boolean | null) {
  forced = on;
}

export const oakKindUnresolvedOn = () => forced ?? oakKindUnresolved;
