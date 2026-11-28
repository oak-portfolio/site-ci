import type { CaseStudy } from "@/data/caseStudies";
import { platformCards } from "@/data/homePage";
import { legacyFramerCaseStudies } from "@/data/legacyWork";
import { getWorkPath, getWorkSlug, type WorkEntry, workEntryToCaseStudy } from "@/lib/workContent";

export type WorkPreviewCard = {
  kind: "live" | "staged";
  title: string;
  description?: string;
  primaryTag: string;
  dateLabel: string;
  dateTime?: string;
  href?: string;
  external?: boolean;
  image: string;
  imageAlt: string;
  statusLabel?: string;
  disabled: boolean;
  slug?: string;
};

const workDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function getPrimaryWorkTag(card: { badge?: string; category: string }) {
  if (card.badge && card.badge.toLowerCase() !== "soon") return card.badge;
  return card.category.split(",")[0]?.trim() || "Case study";
}

function formatWorkDate(date: Date) {
  return workDateFormatter.format(date);
}

function getPreviewTimestamp(card: WorkPreviewCard) {
  return card.dateTime ? new Date(card.dateTime).getTime() : Number.NEGATIVE_INFINITY;
}

function sortWorkPreviewCardsByDateDesc(cards: WorkPreviewCard[]) {
  return [...cards].sort((left, right) => {
    const leftTime = getPreviewTimestamp(left);
    const rightTime = getPreviewTimestamp(right);

    if (leftTime !== rightTime) return rightTime - leftTime;
    return left.title.localeCompare(right.title);
  });
}

function getCaseStudyTitleContext(caseStudy: CaseStudy) {
  for (const prefix of [caseStudy.card.title, caseStudy.projectName]) {
    const marker = `${prefix}:`;
    if (caseStudy.title.startsWith(marker)) return caseStudy.title.slice(marker.length).trim();
  }

  return caseStudy.title === caseStudy.card.title ? undefined : caseStudy.title;
}

export function workEntryToPreviewCard(entry: WorkEntry): WorkPreviewCard {
  const caseStudy = workEntryToCaseStudy(entry);
  const date = caseStudy.datePublished;

  return {
    kind: "live",
    title: caseStudy.card.title,
    description: getCaseStudyTitleContext(caseStudy),
    primaryTag: getPrimaryWorkTag(caseStudy.card),
    dateLabel: formatWorkDate(date),
    dateTime: date.toISOString(),
    href: getWorkPath(entry),
    image: caseStudy.card.image,
    imageAlt: caseStudy.card.imageAlt,
    statusLabel: caseStudy.card.statusLabel,
    disabled: false,
    slug: getWorkSlug(entry),
  };
}

export function getStagedWorkPreviewCards(): WorkPreviewCard[] {
  return platformCards
    .filter((card) => card.disabled)
    .map((card) => ({
      kind: "staged",
      title: card.title,
      description: card.category,
      primaryTag: getPrimaryWorkTag(card),
      dateLabel: "Soon",
      image: card.image,
      imageAlt: card.imageAlt,
      disabled: true,
    }));
}

export function getLegacyFramerWorkPreviewCards(): WorkPreviewCard[] {
  return sortWorkPreviewCardsByDateDesc(
    legacyFramerCaseStudies.map((card) => {
      const date = new Date(card.datePublished);

      return {
        kind: "staged",
        title: card.title,
        description: card.category,
        primaryTag: card.primaryTag,
        dateLabel: formatWorkDate(date),
        dateTime: date.toISOString(),
        href: card.href,
        external: true,
        image: card.image,
        imageAlt: card.imageAlt,
        disabled: false,
      };
    }),
  );
}

export function getLiveWorkPreviewCards(entries: WorkEntry[], options: { excludeSlug?: string } = {}) {
  return sortWorkPreviewCardsByDateDesc(
    entries
      .filter((entry) => getWorkSlug(entry) !== options.excludeSlug)
      .map(workEntryToPreviewCard),
  );
}

export function getWorkPreviewCards(
  entries: WorkEntry[],
  options: { excludeSlug?: string; includeStaged?: boolean; limit?: number } = {},
) {
  const cards = [
    ...getLiveWorkPreviewCards(entries, { excludeSlug: options.excludeSlug }),
    ...(options.includeStaged === false ? [] : getStagedWorkPreviewCards()),
  ];

  return typeof options.limit === "number" ? cards.slice(0, options.limit) : cards;
}
