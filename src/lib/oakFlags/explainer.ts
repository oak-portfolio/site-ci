/** Ticket 52: Explainer draws a reviewed general-topic fixture, labeled "Drawn by Oak AI"; off, it is the topic's summary as Prose. */
export const oakExplainerBlock = false;
export const oakGalleryKey = "explainer";

let forced: boolean | null = null;

export function forceOakExplainerBlock(on: boolean | null) {
  forced = on;
}

export const oakExplainerBlockOn = () => forced ?? oakExplainerBlock;

let forcedPresets: readonly string[] | null = null;

/** Ticket 53: the gallery and tests pin which presets count as taught; null reads the fragment's `taughtPresets`. */
export function forceOakExplainerPresets(presets: readonly string[] | null) {
  forcedPresets = presets;
}

export const oakExplainerPresetsForced = () => forcedPresets;
