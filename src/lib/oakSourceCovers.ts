/**
 * R11: a cited page of Steve's wears that page's own og:image, the picture a link preview of it shows. A page without its
 * own (home, profile, indexes) wears the site cover, never his avatar or favicon. Pure, so the Work page's
 * `<meta property="og:image">` and the source chip read one rule.
 */

/** BaseLayout's default og:image: every page that does not set its own. */
export const oakSiteOpenGraph = "/assets/brand/steve-oak-open-graph.png";
/** The same artwork as a 22 KB WebP, so a 24px source face never pulls the 370 KB PNG. */
export const oakSiteOpenGraphPreview = "/assets/brand/steve-oak-open-graph.webp";
/** Kusala Daily's overview, privacy and support pages share one social preview. */
export const oakKusalaDailyOpenGraph = "/assets/apps/kusala-daily/social-preview.png";

type WorkStudy = Readonly<{ slug: string; card: Readonly<{ image: string }>; social?: Readonly<{ image: string }> }>;

/** A Work case study's og:image: its social image, else its card image when that is a PNG or JPEG, else its generated cover. */
export function oakWorkOpenGraph(study: WorkStudy) {
  return study.social?.image ?? (/\.(png|jpe?g)$/i.test(study.card.image) ? study.card.image : `/assets/work/${study.slug}.png`);
}

export type OakSourceCoverInputs = Readonly<{
  work: readonly WorkStudy[];
  /** Legacy case studies on the old Framer host, each with its listed cover. */
  legacy: readonly Readonly<{ href: string; image: string }>[];
  /** Each role on /work, by timeline id, with its timeline artwork. */
  roles: readonly Readonly<{ id: string; image: string }>[];
  /** The smallest generated variant of an image, when one exists. */
  smallest: (src: string) => string | undefined;
}>;

export type OakSourceCover = Readonly<{ ogImage: string; cover: string }>;

const key = (url: string) => { try { return new URL(url).href.replace(/\/$/, ""); } catch { return url; } };

/** Every cover a cited page can wear, keyed by its canonical URL (no trailing slash). */
export function oakSourceCoverMap({ work, legacy, roles, smallest }: OakSourceCoverInputs) {
  const covers = new Map<string, OakSourceCover>();
  const set = (url: string, ogImage: string, cover = smallest(ogImage) ?? ogImage) => covers.set(key(url), { ogImage, cover });
  for (const study of work) {
    const ogImage = oakWorkOpenGraph(study);
    // An -og crop may have no generated variant; its card image is the same artwork, already small.
    set(`https://steveoak.com/work/${study.slug}/`, ogImage, smallest(ogImage) ?? smallest(study.card.image) ?? ogImage);
  }
  for (const study of legacy) set(study.href, study.image);
  for (const role of roles) set(`https://steveoak.com/work#${role.id}`, role.image, role.image);
  for (const path of ["", "privacy/", "support/"]) set(`https://steveoak.com/apps/kusala-daily/${path}`, oakKusalaDailyOpenGraph);
  // The January memory article is the first version of Agentic Brain, so it wears that cover.
  const agenticBrain = covers.get(key("https://steveoak.com/work/agentic-brain/"));
  if (agenticBrain) covers.set(key("https://independent-performance-642823.framer.app/codex/ai-memory-hallucination-solution"), agenticBrain);
  return covers;
}

/**
 * The cover for one cited page. Any other steveoak.com page wears the site cover; another host wears only a cover it is
 * known to have, else none, so its popover stays text-only.
 */
export function oakSourceCoverFor(canonicalUrl: string, covers: ReadonlyMap<string, OakSourceCover>): OakSourceCover | undefined {
  const known = covers.get(key(canonicalUrl));
  if (known) return known;
  return URL.canParse(canonicalUrl) && new URL(canonicalUrl).hostname.replace(/^www\./, "") === "steveoak.com"
    ? { ogImage: oakSiteOpenGraph, cover: oakSiteOpenGraphPreview } : undefined;
}
