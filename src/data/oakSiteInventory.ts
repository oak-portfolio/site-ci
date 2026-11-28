/** Ticket 33: the site's public pages and their tagged sections, the only pages a site-map table may list. Case studies under
 * /work/<slug> are public by the sitemap rule and named by their own record card. */
export type OakSitePage = Readonly<{ path: string; title: string; sections: readonly Readonly<{ tag: string; title: string }>[] }>;

// shortcut: hand-kept, since section titles live nowhere in source and sections come through layout composition; table.test.mjs fails when a public page or tag drifts. Generate it at build once titles move into the tags.
export const oakSiteInventory: readonly OakSitePage[] = [
  { path: "/", title: "Home", sections: [
    { tag: "home.hero", title: "Introduction" }, { tag: "home.proof", title: "Proof" },
    { tag: "home.workspace", title: "Oak AI Agent" }, { tag: "home.contact", title: "Contact" }] },
  { path: "/work", title: "Work", sections: [{ tag: "home.work", title: "Case studies" }, { tag: "work.timeline", title: "Career timeline" }] },
];

/** The sitemap's public rule (astro.config.mjs isPublicSitemapPathname), trailing slash dropped. */
export function oakSitePublicPath(pathname: string) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return path === "/" || path === "/work" || /^\/work\/[a-z0-9-]+$/.test(path) || /^\/apps\/kusala-daily(?:\/(?:privacy|support))?$/.test(path);
}
