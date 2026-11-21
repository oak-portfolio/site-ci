import type { OakCareerLink } from "../../../packages/oak-agent-contracts/src/openui/plan";

/** Ticket 42: Role draws its entry's situation tags and credential rows, and the entry card with its approved case-study link; off, the shipped Role row. */
export const oakRoleEntryCard = false;
export const oakGalleryKey = "role";

let forced: boolean | null = null;
let links: readonly OakCareerLink[] | null = null;

/** `rows`, when given, also sets the link-table stand-in, so the gallery pins both in one call. */
export function forceOakRoleEntryCard(on: boolean | null, rows?: readonly OakCareerLink[] | null) {
  forced = on;
  if (rows !== undefined) links = rows;
}

/** Gallery and tests only: a stand-in for ticket 30's link table; null reads the shipped table. */
export function forceOakRoleEntryLinks(rows: readonly OakCareerLink[] | null) {
  links = rows;
}

export const oakRoleEntryCardOn = () => forced ?? oakRoleEntryCard;
export const oakRoleEntryLinks = () => links ?? undefined;
