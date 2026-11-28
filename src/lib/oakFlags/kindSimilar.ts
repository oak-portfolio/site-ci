/** Ticket 60 (ksimilar): advice shows the one case study its evidence cites as Steve's record beside it; off, the advice card alone. */
export const oakKindSimilar = false;
export const oakGalleryKey = "kindSimilar";

let forced: boolean | null = null;

export function forceOakKindSimilar(on: boolean | null) {
  forced = on;
}

export const oakKindSimilarOn = () => forced ?? oakKindSimilar;
