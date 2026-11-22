/** Ticket 57 (map Callout row): a Callout typed held, now, off or guard names its kind in words beside its own icon; off, every caveat is the one info note. */
export const oakCalloutKinds = false;
export const oakGalleryKey = "calloutKinds";

let forced: boolean | null = null;

export function forceOakCalloutKinds(on: boolean | null) {
  forced = on;
}

export const oakCalloutKindsOn = () => forced ?? oakCalloutKinds;
