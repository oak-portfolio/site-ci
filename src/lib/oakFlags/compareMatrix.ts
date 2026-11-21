/** Ticket 57: Compare reads as a matrix, its two columns headed by each page's cover and name; off, it is the plain pair. */
export const oakCompareMatrix = true;
export const oakGalleryKey = "compareMatrix";

let forced: boolean | null = null;

export function forceOakCompareMatrix(on: boolean | null) {
  forced = on;
}

export const oakCompareMatrixOn = () => forced ?? oakCompareMatrix;
