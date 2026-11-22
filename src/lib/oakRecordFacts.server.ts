import path from "node:path";
import sharp from "sharp";
import owners from "../../knowledge/owners.json";
import { careerTimelineItems, type CareerTimelineItem } from "@/data/careerTimeline";
import { oakArtifactImages } from "@/data/oakArtifactImages";
import { optimizedImages, type OptimizedImageEntry } from "@/data/generated/optimizedImages";
import { heroCopy, profileSummary } from "@/data/homePage";
import { createMachinePages, siteProfile, type MachinePage } from "@/data/machineContent";
import { knowledgeRevision, knowledgeSnapshot } from "@/lib/knowledge/snapshot";
import { oakPublishable, oakResultMetric } from "@/lib/oakPublishable";
import { OAK_RECORD_FACTS_VERSION, type OakAppFacts, type OakExperienceFacts, type OakProfileFacts, type OakRecordFact, type OakRecordFacts,
  type OakWorkFacts } from "@/lib/oakRecordFacts";
import { oakSiteItem } from "@/lib/openui/components/site/items";
import { getWorkEntries, getWorkSlug, type WorkEntry } from "@/lib/workContent";

type Rgb = readonly [number, number, number];

/** `--oak-raised`, the answer card's surface: 7% `--text` (#fff) over `--panel` (#0c0c0c). */
const CARD_SURFACE: Rgb = [29, 29, 29];
const AA = 4.6;

const imageOf = (src: string) => (optimizedImages as Record<string, OptimizedImageEntry>)[src];
/** A card-size WebP (480 to 960px wide) when one was generated, else the original. */
const cardSize = (src: string) => imageOf(src)?.variants?.webp?.filter(variant => variant.width >= 480 && variant.width <= 960).at(-1)?.src ?? src;
const ratioOf = (src: string) => { const ratio = imageOf(src)?.aspectRatio; return ratio ? { ratio: Math.round(ratio * 1000) / 1000 } : {}; };
const day = (date: Date | undefined) => date?.toISOString().slice(0, 10);

const linear = (channel: number) => { const c = channel / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]: Rgb) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const contrast = (left: Rgb, right: Rgb) => { const [a, b] = [luminance(left), luminance(right)].sort((x, y) => y - x); return (a + 0.05) / (b + 0.05); };
const toHex = (rgb: Rgb) => `#${rgb.map(channel => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;

function toHsl([r, g, b]: Rgb): Rgb {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === red ? ((green - blue) / d + 6) % 6 : max === green ? (blue - red) / d + 2 : (red - green) / d + 4;
  return [h * 60, s, l];
}

function fromHsl([h, s, l]: Rgb): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * One accent from a cover's pixels: the strongest hue band weighted by chroma, averaged, then lightened until it meets
 * AA against the card surface, so a tint can carry text or an edge on a card.
 */
export function oakCoverTint(pixels: Uint8Array, channels: number): string {
  const bands = Array.from({ length: 12 }, () => ({ weight: 0, rgb: [0, 0, 0] }));
  for (let index = 0; index + 2 < pixels.length; index += channels) {
    const rgb: Rgb = [pixels[index], pixels[index + 1], pixels[index + 2]];
    const chroma = (Math.max(...rgb) - Math.min(...rgb)) / 255;
    if (chroma < 0.12) continue;
    const band = bands[Math.floor(toHsl(rgb)[0] / 30) % 12];
    band.weight += chroma * chroma;
    rgb.forEach((channel, at) => { band.rgb[at] += channel * chroma * chroma; });
  }
  const top = bands.reduce((best, band) => band.weight > best.weight ? band : best);
  const base: Rgb = top.weight ? [top.rgb[0] / top.weight, top.rgb[1] / top.weight, top.rgb[2] / top.weight] : [128, 128, 128];
  let [h, s, l] = toHsl(base);
  while (contrast(fromHsl([h, s, l]), CARD_SURFACE) < AA && l < 0.98) l = Math.min(0.98, l + 0.01);
  return toHex(fromHsl([h, s, l]));
}

async function coverTint(src: string) {
  const { data, info } = await sharp(path.join(process.cwd(), "public", src)).resize(64, 64, { fit: "inside" }).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  return oakCoverTint(data, info.channels);
}

/** Section anchors in reading order, from the fragments the record's own citations link to. */
function sectionsOf(documentId: string) {
  const sections = new Map<string, string>();
  for (const passage of knowledgeSnapshot.documents.find(document => document.id === documentId)?.passages ?? []) {
    const anchor = new URL(passage.citationUrl).hash.slice(1);
    if (anchor && !sections.has(anchor)) sections.set(anchor, passage.headingPath[0] ?? "");
  }
  return [...sections].map(([anchor, title]) => ({ anchor, title }));
}

async function workFacts(entry: WorkEntry): Promise<OakWorkFacts> {
  const { data } = entry;
  const images = oakArtifactImages[getWorkSlug(entry)] ?? {};
  return {
    kind: "work", dek: data.dek, category: data.card.category,
    ...(data.card.badge ? { badge: data.card.badge } : {}),
    articleStatus: data.articleStatus,
    ...(data.card.statusLabel ? { statusLabel: data.card.statusLabel } : {}),
    datePublished: day(data.datePublished)!,
    ...(data.dateUpdated ? { dateUpdated: day(data.dateUpdated) } : {}),
    ...(data.timeline ? { period: data.timeline } : {}),
    cover: { src: cardSize(data.card.image), alt: data.card.imageAlt, ...ratioOf(data.card.image) },
    coverTint: await coverTint(data.card.image),
    systemMap: data.systemMap.map(({ label, description }) => ({ label, description })),
    artifacts: data.artifacts.filter(oakPublishable).map(({ label }) => {
      const image = images[label];
      if (!image) return { label, status: "verified" as const };
      const src = image.preserveAnimation ? image.src : cardSize(image.src);
      return { label, status: "verified" as const, image: { src, alt: image.alt, ...ratioOf(image.src) } };
    }),
    heldArtifacts: data.artifacts.filter(artifact => !oakPublishable(artifact)).length,
    metrics: data.metrics.filter(oakResultMetric).map(({ label, value, kind }) => ({ label, value, ...(kind ? { kind } : {}) })),
    sections: sectionsOf(`work:${getWorkSlug(entry)}`),
  };
}

const profileFacts: OakProfileFacts = {
  kind: "profile",
  hero: { title: heroCopy.title, description: heroCopy.description },
  summary: { heading: profileSummary.heading, description: profileSummary.description,
    facts: profileSummary.facts.map(({ label, value }) => ({ label, value })) },
  knowsAbout: siteProfile.focus,
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "May 2026" to "2026-05"; anything else is unreadable. */
function month(text: string | undefined) {
  const [name, year, extra] = text?.trim().split(/\s+/) ?? [];
  const at = MONTHS.indexOf(name ?? "");
  return at >= 0 && /^\d{4}$/.test(year ?? "") && extra === undefined ? `${year}-${String(at + 1).padStart(2, "0")}` : undefined;
}

/** A career entry's facts from its first employment context; none without a reviewed engagement or a readable date range. */
export function oakExperienceFacts(item: CareerTimelineItem): OakExperienceFacts | undefined {
  const role = item.contexts.find(context => context.type === "employment");
  const [start, end, extra] = item.date.split(" - ");
  const dateStart = month(start), dateEnd = end === "Present" ? undefined : month(end);
  if (!role || !dateStart || extra !== undefined || (end !== "Present" && !dateEnd)) return undefined;
  return { kind: "experience", engagement: role.engagement, dateStart, ...(dateEnd ? { dateEnd } : {}), title: role.title };
}

/** The app card from the owner's outputs and the reviewed page config of each; the app's own page leads, and a field the page lacks is absent. */
export function oakAppFacts(item: { outputs: readonly string[] } | null, configs: readonly Pick<MachinePage, "path" | "shortTitle" | "facts">[]): OakAppFacts | undefined {
  const isSubPage = (pagePath: string) => configs.some(page => pagePath.startsWith(`${page.path}/`));
  const pages = (item?.outputs ?? []).flatMap(output => configs.filter(page => page.path === output));
  const home = pages.find(page => !isSubPage(page.path));
  if (!home) return undefined;
  const privacy = home.facts.find(fact => fact.source === "Policy" && fact.label === "Privacy")?.value;
  return {
    kind: "app", name: home.shortTitle, path: home.path,
    facts: home.facts.filter(fact => fact.source === "App").slice(0, 3).map(fact => fact.value),
    ...(privacy ? { privacy } : {}),
    pages: pages.filter(page => page.path.startsWith(`${home.path}/`))
      .map(page => ({ label: page.shortTitle.replace(home.shortTitle, "").trim(), href: page.path })),
  };
}

const pathOf = (url: string) => new URL(url).pathname.replace(/\/$/, "");

/** The reviewed app-info pages, read through the public machine pages so machineContent keeps its approved bytes. */
export const oakAppPages = () => createMachinePages([]).filter(page => page.pageType === "app-info");

/** The reviewed facts behind every published record, keyed by knowledge document id, for one knowledge revision. */
export async function oakRecordFacts(): Promise<OakRecordFacts> {
  const published = new Set(knowledgeSnapshot.documents.map(document => document.id));
  const records: Record<string, OakRecordFact> = {};
  for (const entry of await getWorkEntries()) {
    const documentId = `work:${getWorkSlug(entry)}`;
    if (published.has(documentId)) records[documentId] = await workFacts(entry);
  }
  if (published.has("profile:steve-oak")) records["profile:steve-oak"] = profileFacts;
  for (const item of careerTimelineItems) {
    const facts = oakExperienceFacts(item);
    if (facts && published.has(`experience:${item.id}`)) records[`experience:${item.id}`] = facts;
  }
  const app = oakAppFacts(oakSiteItem("app", owners.owners), oakAppPages());
  const appPaths = new Set(app ? [app.path, ...app.pages.map(page => page.href)] : []);
  for (const document of knowledgeSnapshot.documents) if (app && appPaths.has(pathOf(document.canonicalUrl))) records[document.id] = app;
  return { version: OAK_RECORD_FACTS_VERSION, knowledgeRevision, records };
}
