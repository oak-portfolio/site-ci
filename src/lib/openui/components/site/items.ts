import { inAnswers, siteLibraryItem, type SiteLibraryOwner } from "@/data/siteLibrary";

export const oakSiteKinds = ["app", "resource", "section", "mascot", "tour", "now", "career-rail", "proof", "digest", "social", "notOnSite"] as const;
export type OakSiteKind = (typeof oakSiteKinds)[number];

/** The Site library owner each kind reads, and the cited documents it may stand for. Mascot, tour, now and digest have no answer item yet. */
const SOURCES: Partial<Record<OakSiteKind, { owner: string; cites: (documentId: string) => boolean }>> = {
  app: { owner: "kusala", cites: id => id.startsWith("resource:kusala-daily") },
  resource: { owner: "profile-home", cites: id => id === "profile:steve-oak" },
  section: { owner: "profile-home", cites: id => id === "profile:steve-oak" },
  proof: { owner: "profile-home", cites: id => id === "profile:steve-oak" },
  social: { owner: "profile-home", cites: id => id === "profile:steve-oak" },
  "career-rail": { owner: "experience", cites: id => id.startsWith("experience:") },
};

/** A kind's item only when its owner is approved with `answer` in its channels; a draft, held, planned or missing owner is null. */
export function oakSiteItem(kind: OakSiteKind, owners: readonly (SiteLibraryOwner & { outputs?: readonly string[] })[]) {
  const source = SOURCES[kind];
  const owner = source && owners.find(entry => entry.id === source.owner);
  if (!source || !owner) return null;
  const item = siteLibraryItem(owner);
  return inAnswers(item) ? { ...item, outputs: owner.outputs ?? [], cites: source.cites } : null;
}
