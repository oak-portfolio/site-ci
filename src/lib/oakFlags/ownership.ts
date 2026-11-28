/** Ticket 27: Ownership shows Steve's lines beside his collaborators' for the record its claim cites; off, it is the plain Points list. */
export const oakOwnershipBlock = false;
export const oakGalleryKey = "ownership";

let forced: boolean | null = null;

export function forceOakOwnershipBlock(on: boolean | null) {
  forced = on;
}

export const oakOwnershipBlockOn = () => forced ?? oakOwnershipBlock;
