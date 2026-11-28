/** Ticket 50: the public gallery of recorded answer replays at /gallery, and its six cards on the Ask home. Off, the route 404s. */
export const oakGalleryPage = false;
export const oakGalleryKey = "galleryPage";

let forced: boolean | null = null;

export function forceOakGalleryPage(on: boolean | null) {
  forced = on;
}

export const oakGalleryPageOn = () => forced ?? oakGalleryPage;
