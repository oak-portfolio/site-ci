/** Ticket 41: PageCards draws one card per cited page, the first open in place on its quick look; off, each claim is its Source card. */
export const oakPageCards = true;
export const oakGalleryKey = "pageCards";

let forced: boolean | null = null;

export function forceOakPageCards(on: boolean | null) {
  forced = on;
}

export const oakPageCardsOn = () => forced ?? oakPageCards;
