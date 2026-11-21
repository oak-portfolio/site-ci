/** Ticket 39: Screens shows a cited record's mapped artifact images in one frame with a filmstrip; off, it is the Source card. */
export const oakScreensBlock = true;
export const oakGalleryKey = "screens";

let forced: boolean | null = null;

export function forceOakScreensBlock(on: boolean | null) {
  forced = on;
}

export const oakScreensBlockOn = () => forced ?? oakScreensBlock;
