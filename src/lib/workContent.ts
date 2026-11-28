import { getCollection, type CollectionEntry } from "astro:content";
import type { CaseStudy } from "@/data/caseStudies";

export type WorkEntry = CollectionEntry<"work">;

export function getWorkSlug(entry: WorkEntry) {
  return entry.id.replace(/\.(md|mdx)$/i, "").replace(/\/index$/i, "");
}

export function getWorkPath(entry: WorkEntry) {
  return `/work/${getWorkSlug(entry)}`;
}

export function workEntryToCaseStudy(entry: WorkEntry): CaseStudy {
  const data = entry.data;

  return {
    slug: getWorkSlug(entry),
    title: data.title,
    projectName: data.projectName,
    eyebrow: data.eyebrow,
    dek: data.dek,
    description: data.description,
    role: data.role,
    timeline: data.timeline,
    stack: data.stack,
    datePublished: data.datePublished,
    dateUpdated: data.dateUpdated,
    featured: data.featured,
    draft: data.draft,
    order: data.order,
    articleStatus: data.articleStatus,
    card: data.card,
    hero: data.hero,
    social: data.social,
    problem: data.problem,
    ownership: data.ownership,
    systemMap: data.systemMap,
    metrics: data.metrics,
    evidenceStatus: data.evidenceStatus,
    artifacts: data.artifacts,
    jobMappings: data.jobMappings,
    tbdQueue: data.tbdQueue,
    seo: data.seo,
    schema: data.schema,
    sources: data.sources,
    machineSummary: data.machineSummary,
    machineQuestions: data.machineQuestions,
  };
}

export async function getWorkEntries() {
  const entries = await getCollection("work");
  return entries.sort((left, right) => {
    if (left.data.order !== right.data.order) return left.data.order - right.data.order;
    if (left.data.featured !== right.data.featured) return left.data.featured ? -1 : 1;
    return right.data.datePublished.getTime() - left.data.datePublished.getTime();
  });
}

export async function getCaseStudiesFromCollection() {
  const entries = await getWorkEntries();
  return entries.map(workEntryToCaseStudy);
}

export async function getWorkEntryBySlug(slug: string) {
  const normalizedSlug = slug.replace(/^\/+|\/+$/g, "");
  const entries = await getWorkEntries();
  return entries.find((entry) => getWorkSlug(entry) === normalizedSlug);
}

export async function getCaseStudyBySlugFromCollection(slug: string) {
  const entry = await getWorkEntryBySlug(slug);
  return entry ? workEntryToCaseStudy(entry) : undefined;
}
