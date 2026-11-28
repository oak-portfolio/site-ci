/** Ticket 57: Timeline draws each cited case study as a lane on one month axis; off, it is the vertical rail. */
export const oakTimelineLanes = true;
export const oakGalleryKey = "timelineLanes";

let forced: boolean | null = null;

export function forceOakTimelineLanes(on: boolean | null) {
  forced = on;
}

export const oakTimelineLanesOn = () => forced ?? oakTimelineLanes;
