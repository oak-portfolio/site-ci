/** Ticket 230: a sourced answer to a mixed contact and work ask ends with the Contact card; off, its contact card part stays the bare Contact Steve button. */
export const oakCardAfterAnswer = false;
export const oakGalleryKey = "cardAfterAnswer";

let forced: boolean | null = null;

export function forceOakCardAfterAnswer(on: boolean | null) {
  forced = on;
}

export const oakCardAfterAnswerOn = () => forced ?? oakCardAfterAnswer;
