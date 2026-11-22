/** Ticket 32: StackMap maps the tools the cited records list, and two records' overlap; off, it is the plain tool chips beside the Points list. */
export const oakStackMap = true;
export const oakGalleryKey = "stackMap";

let forced: boolean | null = null;

export function forceOakStackMap(on: boolean | null) {
  forced = on;
}

export const oakStackMapOn = () => forced ?? oakStackMap;
