import { careerTimelineItems } from "@/data/careerTimeline";
import { legacyFramerCaseStudies } from "@/data/legacyWork";
import { optimizedImages, type OptimizedImageEntry } from "@/data/generated/optimizedImages";
import { knowledgeRevision, knowledgeSnapshot } from "@/lib/knowledge/snapshot";
import type { OakCitationLabels, OakSourceCard } from "@/lib/oakCitationLabels";
import { oakResultMetric } from "@/lib/oakPublishable";
import { oakSourceCoverFor, oakSourceCoverMap, oakWorkOpenGraph } from "@/lib/oakSourceCovers";
import { getWorkEntries, getWorkSlug } from "@/lib/workContent";

const variantsOf = (src: string) => (optimizedImages as Record<string, OptimizedImageEntry>)[src]?.variants?.webp ?? [];
/** The smallest generated WebP of a cover, so a 24px source thumbnail never pulls the full-size PNG. */
const smallest = (src: string) => variantsOf(src)[0]?.src;
/** R16: a card-size WebP of an image, the widest generated variant from 480 to 960px (a card is about 400px wide at 2x). */
const cardSize = (src: string) => variantsOf(src).filter(variant => variant.width >= 480 && variant.width <= 960).at(-1)?.src;
/** The first (smallest) entry of a srcset, so a role's timeline artwork costs one 480px WebP. */
const firstSrc = (srcSet: string) => srcSet.split(",")[0]?.trim().split(/\s+/)[0];
const key = (url: string) => url.replace(/\/$/, "");
/** R20: an image's own width over height from the generated manifest, rounded so the labels stay small. */
const ratioOf = (src: string) => { const ratio = (optimizedImages as Record<string, OptimizedImageEntry>)[src]?.aspectRatio;
  return ratio ? Math.round(ratio * 1000) / 1000 : undefined; };

/**
 * R16: each card's facts, keyed by canonical URL. A metric shows only when its evidence is verified and it describes the
 * work (not the page's own cover file, the role the meta line already shows, or a "TBD"), so a card never shows a number
 * Oak has not confirmed.
 */
function oakSourceCards(work: Awaited<ReturnType<typeof getWorkEntries>>) {
  const cards = new Map<string, OakSourceCard>();
  for (const entry of work) {
    const study = { ...entry.data, slug: getWorkSlug(entry) };
    const ogImage = oakWorkOpenGraph(study);
    const metrics = study.metrics.filter(oakResultMetric).slice(0, 3).map(({ label, value }) => ({ label, value }));
    cards.set(key(`https://steveoak.com/work/${study.slug}/`), {
      kind: "work", title: study.card.title, image: cardSize(study.card.image) ?? cardSize(ogImage) ?? ogImage, imageAlt: study.card.imageAlt,
      ...withRatio(ratioOf(study.card.image) ?? ratioOf(ogImage)),
      role: study.role, period: study.timeline, stack: study.stack.slice(0, 8), ...(metrics.length ? { metrics } : {}),
    });
  }
  for (const study of legacyFramerCaseStudies)
    cards.set(key(study.href), { kind: "work", title: study.title, image: cardSize(study.image) ?? study.image, imageAlt: study.imageAlt, ...withRatio(ratioOf(study.image)) });
  for (const item of careerTimelineItems) {
    const image = firstSrc(item.media.webpSrcSet);
    cards.set(key(`https://steveoak.com/work#${item.id}`), {
      kind: "role", title: (item.contexts.find(context => context.type === "employment") ?? item.contexts[0]).title,
      // R20 (Oak, review v17, sixth flag on roles): each role shows its own timeline artwork at the artwork's shape.
      ...(image ? { image, imageAlt: item.media.alt, imageRatio: Math.round(item.media.width / item.media.height * 1000) / 1000 } : {}), period: item.date, place: item.place,
      stack: item.stack.flatMap(group => group.items).slice(0, 8),
    });
  }
  return cards;
}

const withRatio = (imageRatio: number | undefined) => imageRatio ? { imageRatio } : {};

/**
 * R11: a cited page of Steve's shows its own og:image (src/lib/oakSourceCovers.ts). Work case studies and Kusala Daily
 * use theirs, legacy Framer case studies their listed cover, each role on /work its timeline artwork (review v4), and
 * every other steveoak.com page the site cover. Other hosts show no cover. R16: Work, legacy and role pages also carry
 * their card facts.
 */
export async function oakCitationLabelsWithCovers(): Promise<OakCitationLabels> {
  const work = await getWorkEntries();
  const covers = oakSourceCoverMap({
    work: work.map(entry => ({ ...entry.data, slug: getWorkSlug(entry) })),
    legacy: legacyFramerCaseStudies,
    roles: careerTimelineItems.flatMap(item => { const image = firstSrc(item.media.webpSrcSet); return image ? [{ id: item.id, image }] : []; }),
    smallest,
  });
  const cards = oakSourceCards(work);
  return {
    knowledgeRevision,
    documents: knowledgeSnapshot.documents.map(({ id, title, canonicalUrl }) => {
      const cover = oakSourceCoverFor(canonicalUrl, covers)?.cover;
      const card = cards.get(key(canonicalUrl));
      return { documentId: id, title, canonicalUrl, ...(cover ? { cover } : {}), ...(card ? { card } : {}) };
    }),
  };
}
