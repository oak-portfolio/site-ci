import type { CaseStudy } from "./caseStudies";
import { oakPublishable } from "../lib/oakPublishable.ts";

export const siteLibraryStatuses = ["draft", "approved", "held", "planned"] as const;
export const siteLibraryChannels = ["page", "answer", "ai-files"] as const;

export type SiteLibraryStatus = (typeof siteLibraryStatuses)[number];
export type SiteLibraryChannel = (typeof siteLibraryChannels)[number];
export type SiteLibraryOwner = Readonly<{ id: string; status: string; channels?: readonly string[] }>;
export type SiteLibraryItem = { id: string; status: SiteLibraryStatus; channels: SiteLibraryChannel[] };
export type SiteLibrarySection = { anchor: string; owner: string; path: string };
export type SiteLibraryMedia = { src: string; alt: string; use: "card" | "hero" | "social" };
export type SiteLibraryApp = { id: string; owner: string; path: string; pages: string[] };
export type SiteLibraryCaseStudy = SiteLibraryItem & {
  owner: "work";
  path?: string;
  media?: SiteLibraryMedia[];
  fields?: { projectName: string; role: string; timeline: string; stack: string[]; metrics: { label: string; value: string }[] };
};
export type SiteLibrary = { items: SiteLibraryItem[]; sections: SiteLibrarySection[]; apps: SiteLibraryApp[]; caseStudies: SiteLibraryCaseStudy[] };

type CaseStudyInput = Pick<CaseStudy, "slug" | "draft" | "projectName" | "role" | "timeline" | "stack" | "card" | "hero" | "social"> & {
  metrics: readonly Pick<CaseStudy["metrics"][number], "label" | "value" | "status">[];
};

const pageSections: readonly SiteLibrarySection[] = [
  { anchor: "home.hero", owner: "profile-home", path: "/" },
  { anchor: "home.proof", owner: "profile-home", path: "/" },
  { anchor: "home.workspace", owner: "profile-home", path: "/" },
  { anchor: "home.work", owner: "work", path: "/" },
  { anchor: "home.contact", owner: "home-authored-copy", path: "/" },
  { anchor: "work.timeline", owner: "experience", path: "/work" },
];

const apps: readonly SiteLibraryApp[] = [
  { id: "kusala-daily", owner: "kusala", path: "/apps/kusala-daily", pages: ["/apps/kusala-daily/support", "/apps/kusala-daily/privacy"] },
];

export function siteLibraryItem(owner: SiteLibraryOwner): SiteLibraryItem {
  if (!siteLibraryStatuses.includes(owner.status as SiteLibraryStatus)) throw new Error(`Invalid Site library status: ${owner.id}`);
  const status = owner.status as SiteLibraryStatus;
  const channels = owner.channels;
  if (!Array.isArray(channels) || new Set(channels).size !== channels.length ||
    channels.some((channel) => !siteLibraryChannels.includes(channel as SiteLibraryChannel))) {
    throw new Error(`Invalid Site library channels: ${owner.id}`);
  }
  if (status !== "approved" && channels.length) throw new Error(`A ${status} Site library item is in no channel: ${owner.id}`);
  return { id: owner.id, status, channels: [...channels] as SiteLibraryChannel[] };
}

const isLive = (item: SiteLibraryItem | undefined) => item?.status === "approved" && item.channels.length > 0;
const onPage = (item: SiteLibraryItem | undefined) => isLive(item) && item!.channels.includes("page");
export const inAnswers = (item: SiteLibraryItem) => isLive(item) && item.channels.includes("answer");

function mediaFor(caseStudy: CaseStudyInput): SiteLibraryMedia[] {
  const uses = [["card", caseStudy.card], ["hero", caseStudy.hero], ["social", caseStudy.social]] as const;
  return uses.flatMap(([use, image]) => {
    if (!image) return [];
    if (!image.imageAlt?.trim()) throw new Error(`Site library media needs alt text: ${caseStudy.slug} ${use}`);
    return [{ src: image.image, alt: image.imageAlt, use }];
  });
}

function toCaseStudy(caseStudy: CaseStudyInput, work: SiteLibraryItem): SiteLibraryCaseStudy {
  const status: SiteLibraryStatus = caseStudy.draft ? "draft" : work.status;
  const entry = { id: `work:${caseStudy.slug}`, owner: "work" as const, status, channels: status === "approved" ? [...work.channels] : [] };
  if (!isLive(entry)) return entry;
  const media = mediaFor(caseStudy);
  return { ...entry, path: `/work/${caseStudy.slug}`, media, fields: {
    projectName: caseStudy.projectName, role: caseStudy.role, timeline: caseStudy.timeline, stack: [...caseStudy.stack],
    metrics: caseStudy.metrics.filter(oakPublishable).map(({ label, value }) => ({ label, value })),
  } };
}

export function createSiteLibrary(owners: readonly SiteLibraryOwner[], caseStudies: readonly CaseStudyInput[]): SiteLibrary {
  const items = owners.map(siteLibraryItem);
  const byId = new Map(items.map((item) => [item.id, item]));
  const work = byId.get("work") ?? { id: "work", status: "held", channels: [] };
  const entries = caseStudies.map((caseStudy) => toCaseStudy(caseStudy, work));
  const caseStudySections = entries.filter((entry) => onPage(entry))
    .map((entry) => ({ anchor: `${entry.id.slice("work:".length)}.system`, owner: "work", path: entry.path! }));
  return {
    items,
    sections: [...pageSections.filter((section) => onPage(byId.get(section.owner))), ...caseStudySections],
    apps: apps.filter((app) => onPage(byId.get(app.owner))).map((app) => ({ ...app, pages: [...app.pages] })),
    caseStudies: entries,
  };
}

export function publicSiteLibrary(library: SiteLibrary): SiteLibrary {
  const live = new Set(library.items.filter(inAnswers).map((item) => item.id));
  return {
    items: library.items.filter((item) => live.has(item.id)),
    sections: library.sections.filter((section) => live.has(section.owner)),
    apps: library.apps.filter((app) => live.has(app.owner)),
    caseStudies: library.caseStudies.filter(inAnswers),
  };
}
