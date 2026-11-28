export const oakPausedBanner = false;
export const oakGalleryKey = "pausedBanner";

let forced: boolean | null = null;

export function forceOakPausedBanner(on: boolean | null) {
  forced = on;
}

export const oakPausedBannerOn = () => forced ?? oakPausedBanner;
