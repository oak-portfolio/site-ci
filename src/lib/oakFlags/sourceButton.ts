/** Ticket 57 (R11-C4): the Source card's open button is a white icon on a capsule concentric with the page; off, the glass disc. */
export const oakSourceButton = true;
export const oakGalleryKey = "sourceButton";

let forced: boolean | null = null;

export function forceOakSourceButton(on: boolean | null) {
  forced = on;
}

export const oakSourceButtonOn = () => forced ?? oakSourceButton;
