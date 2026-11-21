/** Ticket 19 (Q34 A): an arranged answer reorders its blocks for the visitor's purpose, with a capsule and Undo, or a switch when none is known. */
export const oakShowMeAs = false;
export const oakGalleryKey = "showMeAs";

let forced: boolean | null = null;

export function forceOakShowMeAs(on: boolean | null) {
  forced = on;
}

export const oakShowMeAsOn = () => forced ?? oakShowMeAs;
