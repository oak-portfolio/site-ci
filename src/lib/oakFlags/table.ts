/** Ticket 33: Table lays the records its claims cite out as rows and columns; off, it is the plain Points list. */
export const oakTableBlock = true;
export const oakGalleryKey = "table";

let forced: boolean | null = null;

export function forceOakTableBlock(on: boolean | null) {
  forced = on;
}

export const oakTableBlockOn = () => forced ?? oakTableBlock;
