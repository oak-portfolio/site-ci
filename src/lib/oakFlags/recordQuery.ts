/** Ticket 72: Query("oak_record", { documentId }) loads a reviewed record's public facts from the record-facts asset; off, every Query settles to nothing. */
export const oakRecordQuery = false;
export const oakGalleryKey = "recordQuery";

let forced: boolean | null = null;

export function forceOakRecordQuery(on: boolean | null) {
  forced = on;
}

export const oakRecordQueryOn = () => forced ?? oakRecordQuery;
