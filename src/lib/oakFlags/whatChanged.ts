/** Ticket 56: after Edit or Ask again, a note above the new answer names the blocks kept, dropped or added against the answer it replaces. */
export const oakWhatChanged = false;
export const oakGalleryKey = "whatChanged";

let forced: boolean | null = null;

export function forceOakWhatChanged(on: boolean | null) {
  forced = on;
}

export const oakWhatChangedOn = () => forced ?? oakWhatChanged;
