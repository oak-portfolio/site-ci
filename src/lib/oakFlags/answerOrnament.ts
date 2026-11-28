export const oakAnswerOrnament = true;
export const oakGalleryKey = "ornament";

let forced: boolean | null = null;

export function forceOakAnswerOrnament(on: boolean | null) {
  forced = on;
}

export const oakAnswerOrnamentOn = () => forced ?? oakAnswerOrnament;
