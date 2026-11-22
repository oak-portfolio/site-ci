/** Ticket 28: Profile draws the public profile record (portrait, hero title, facts) for a who-is-Steve claim; off, it is the plain Points list. */
export const oakProfileBlock = true;
export const oakGalleryKey = "profile";

let forced: boolean | null = null;

export function forceOakProfileBlock(on: boolean | null) {
  forced = on;
}

export const oakProfileBlockOn = () => forced ?? oakProfileBlock;
