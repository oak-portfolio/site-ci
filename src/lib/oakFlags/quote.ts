/** Ticket 29: Quote draws Steve's own published words and the Bridge to the case study that holds them; off, it is the plain Points list. */
export const oakQuoteBlock = false;
export const oakGalleryKey = "quote";

let forced: boolean | null = null;

export function forceOakQuoteBlock(on: boolean | null) {
  forced = on;
}

export const oakQuoteBlockOn = () => forced ?? oakQuoteBlock;
