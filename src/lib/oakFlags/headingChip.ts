/** Ticket 57 (map Heading row): a Heading given a from label shows it as a provenance chip at the end of its line; off, the words alone. */
export const oakHeadingChip = false;
export const oakGalleryKey = "headingChip";

let forced: boolean | null = null;

export function forceOakHeadingChip(on: boolean | null) {
  forced = on;
}

export const oakHeadingChipOn = () => forced ?? oakHeadingChip;
