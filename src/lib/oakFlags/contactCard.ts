/** Ticket 49: the contact-brief Proposal becomes the Contact card (portrait, Send a note, the one ring glow in an answer); off, it is the next-step row. */
export const oakContactCard = false;
export const oakGalleryKey = "contactCard";

let forced: boolean | null = null;

export function forceOakContactCard(on: boolean | null) {
  forced = on;
}

export const oakContactCardOn = () => forced ?? oakContactCard;
