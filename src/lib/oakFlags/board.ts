/** Ticket 34: Board groups the records its claims cite into columns by a reviewed field; off, it is the plain Points list. */
export const oakBoardBlock = true;
export const oakGalleryKey = "board";

let forced: boolean | null = null;

export function forceOakBoardBlock(on: boolean | null) {
  forced = on;
}

export const oakBoardBlockOn = () => forced ?? oakBoardBlock;
