/**
 * Ticket 49 DRAFT, for Oak's review at sitting 2 (facts rule, NEEDS-OAK O12 and O33). The Contact card shows the availability
 * line and Book a call only once `reviewed` is true, and Book a call only with a booking link. Until then neither renders,
 * and the build folds the draft away so no client chunk carries it.
 */
export type OakContactCardRecord = Readonly<{ reviewed: boolean; availability: string; bookingUrl: string }>;

const reviewed = false;

export const oakContactCardRecord: OakContactCardRecord = reviewed
  ? { reviewed, availability: "Open to full-time AI engineering roles", bookingUrl: "" }
  : { reviewed, availability: "", bookingUrl: "" };

let forced: OakContactCardRecord | null = null;

/** Tests and the gallery pin a record; null returns to the reviewed one above. */
export function forceOakContactCardRecord(next: OakContactCardRecord | null) {
  forced = next;
}

/** The reviewed availability line and booking link, each null when unreviewed or empty. */
export function oakContactCardFacts() {
  const value = forced ?? oakContactCardRecord;
  if (!value.reviewed) return { availability: null, bookingUrl: null };
  return { availability: value.availability.trim() || null, bookingUrl: /^https:\/\//.test(value.bookingUrl) ? value.bookingUrl : null };
}
