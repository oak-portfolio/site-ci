/** Ticket 59: SiteCard answers a public Site library item in its own look; off, it is the Points list. */
export const oakSiteCard = false;
export const oakGalleryKey = "siteCard";

let forced: boolean | null = null;

export function forceOakSiteCard(on: boolean | null) {
  forced = on;
}

export const oakSiteCardOn = () => forced ?? oakSiteCard;
