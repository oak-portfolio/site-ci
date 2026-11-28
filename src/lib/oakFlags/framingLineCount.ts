/** Ticket 227 (absorbs 217): the Framing line counts the distinct projects its cards' claims cite, so one card over several projects reads "From Steve's case studies:"; off, it counts blocks as before. */
export const oakFramingLineCount = false;
export const oakGalleryKey = "framingLineCount";

let forced: boolean | null = null;

export function forceOakFramingLineCount(on: boolean | null) {
  forced = on;
}

export const oakFramingLineCountOn = () => forced ?? oakFramingLineCount;
