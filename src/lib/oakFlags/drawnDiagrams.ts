/** Ticket 54: the model-written `drawn` spec and the seven general Mermaid types; off, both presets draw the concept preset. */
export const oakDrawnDiagrams = false;
export const oakGalleryKey = "drawnDiagrams";

let forced: boolean | null = null;

export function forceOakDrawnDiagrams(on: boolean | null) {
  forced = on;
}

export const oakDrawnDiagramsOn = () => forced ?? oakDrawnDiagrams;
