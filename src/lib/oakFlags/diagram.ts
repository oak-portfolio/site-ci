/** Ticket 44: Diagram draws the cited record's systemMap as a laid-out figure; off, it is the plain Steps list. */
export const oakDiagramBlock = true;
export const oakGalleryKey = "diagram";

let forced: boolean | null = null;

export function forceOakDiagramBlock(on: boolean | null) {
  forced = on;
}

export const oakDiagramBlockOn = () => forced ?? oakDiagramBlock;

let forcedPresets: readonly string[] | null = null;

/** Ticket 45: the gallery and tests pin which presets count as taught; null reads the fragment's `taughtPresets`. */
export function forceOakDiagramPresets(presets: readonly string[] | null) {
  forcedPresets = presets;
}

export const oakDiagramPresetsForced = () => forcedPresets;
