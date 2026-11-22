/** Ticket 46a: a record-only plan (saver and visitor-funded turns) draws its record blocks from app rules with no layout program. O25 flips it. */
export const oakRecordOnlyBlocks = false;
export const oakGalleryKey = "recordOnly";

let forced: boolean | null = null;

export function forceOakRecordOnlyBlocks(on: boolean | null) {
  forced = on;
}

export const oakRecordOnlyBlocksOn = () => forced ?? oakRecordOnlyBlocks;
