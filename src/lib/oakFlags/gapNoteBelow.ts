/** Ticket 225: a gap answer with cited claims reads its note after the answer, as one quiet line; off, the note stays above it. */
export const oakGapNoteBelow = false;
export const oakGalleryKey = "gapNoteBelow";

let forced: boolean | null = null;

export function forceOakGapNoteBelow(on: boolean | null) {
  forced = on;
}

export const oakGapNoteBelowOn = () => forced ?? oakGapNoteBelow;
