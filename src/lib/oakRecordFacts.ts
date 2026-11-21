import * as React from "react";

export const OAK_RECORD_FACTS_VERSION = 1;

/** Ticket 43: a result is Steve's outcome; scope says how big the work was; context is a number about the world around it. */
export type OakMetricKind = "result" | "context" | "scope";

export type OakWorkFacts = Readonly<{
  kind: "work";
  dek: string;
  category: string;
  badge?: string;
  articleStatus: "full" | "in-progress-stub";
  statusLabel?: string;
  datePublished: string;
  dateUpdated?: string;
  /** The work's period as the page states it (its `dates.period`), shown beside a result. */
  period?: string;
  cover: Readonly<{ src: string; alt: string; ratio?: number }>;
  /** One accent from the cover, AA against the card surface. */
  coverTint: string;
  systemMap: readonly Readonly<{ label: string; description: string }>[];
  artifacts: readonly Readonly<{ label: string; status: "verified"; image?: Readonly<{ src: string; alt: string; ratio?: number }> }>[];
  /** How many artifacts Oak has not verified yet: a count only, never their labels. Absent in an older asset. */
  heldArtifacts?: number;
  metrics: readonly Readonly<{ label: string; value: string; kind?: OakMetricKind }>[];
  /** The case study's section anchors, the same fragments its citations link to. */
  sections: readonly Readonly<{ anchor: string; title: string }>[];
}>;

export type OakProfileFacts = Readonly<{
  kind: "profile";
  hero: Readonly<{ title: string; description: string }>;
  summary: Readonly<{ heading: string; description: string; facts: readonly Readonly<{ label: string; value: string }>[] }>;
  knowsAbout: readonly string[];
}>;

/** A career entry's reviewed engagement and role title, with its months as `YYYY-MM` (no end while current). */
export type OakExperienceFacts = Readonly<{
  kind: "experience";
  engagement: "self-employed" | "contract" | "part-time" | "full-time";
  dateStart: string;
  dateEnd?: string;
  title: string;
}>;

/** The app card: its name, its own page, up to three App facts, the Policy privacy line when reviewed, and its sub-pages. */
export type OakAppFacts = Readonly<{
  kind: "app";
  name: string;
  path: string;
  facts: readonly string[];
  privacy?: string;
  pages: readonly Readonly<{ label: string; href: string }>[];
}>;

export type OakRecordFact = OakWorkFacts | OakProfileFacts | OakExperienceFacts | OakAppFacts;

export type OakRecordFacts = Readonly<{
  version: typeof OAK_RECORD_FACTS_VERSION;
  knowledgeRevision: string;
  records: Readonly<Record<string, OakRecordFact>>;
}>;

/** Pending draws the block's ghost; missing (a removed record, another revision, a failed load) draws its degrade. */
export type OakRecordFactsState =
  | Readonly<{ status: "pending" }>
  | Readonly<{ status: "loaded"; facts: OakRecordFact }>
  | Readonly<{ status: "missing" }>;

const PENDING: OakRecordFactsState = { status: "pending" };
const MISSING: OakRecordFactsState = { status: "missing" };
const REVISION = /^[\w-]{1,128}$/;

export const oakRecordFactsUrl = (knowledgeRevision: string) => `/oak/record-facts.${knowledgeRevision}.json`;

const settled = new Map<string, OakRecordFacts | null>();
const inflight = new Map<string, Promise<void>>();
const failed = new Set<string>();
const cached = (knowledgeRevision: string) => settled.has(knowledgeRevision) && !failed.has(knowledgeRevision);

/** Tests and the state gallery seed a revision's facts; the live site loads them on first need. */
export function primeOakRecordFacts(knowledgeRevision: string, value: OakRecordFacts | null) {
  settled.set(knowledgeRevision, value);
  inflight.delete(knowledgeRevision);
  failed.delete(knowledgeRevision);
}

function readFacts(value: unknown, knowledgeRevision: string): OakRecordFacts | null {
  if (!value || typeof value !== "object") return null;
  const facts = value as Partial<OakRecordFacts>;
  return facts.version === OAK_RECORD_FACTS_VERSION && facts.knowledgeRevision === knowledgeRevision &&
    facts.records && typeof facts.records === "object" ? facts as OakRecordFacts : null;
}

export function loadOakRecordFacts(knowledgeRevision: string): Promise<void> {
  if (cached(knowledgeRevision)) return Promise.resolve();
  const running = inflight.get(knowledgeRevision);
  if (running) return running;
  const next = fetch(oakRecordFactsUrl(knowledgeRevision), { credentials: "omit" })
    .then(response => response.ok ? response.json() : null)
    .then(value => { failed.delete(knowledgeRevision); return readFacts(value, knowledgeRevision); },
      () => { failed.add(knowledgeRevision); return null; })
    .then(value => { settled.set(knowledgeRevision, value); inflight.delete(knowledgeRevision); });
  inflight.set(knowledgeRevision, next);
  return next;
}

export function oakRecordFactsState(documentId: string, knowledgeRevision: string): OakRecordFactsState {
  if (!REVISION.test(knowledgeRevision)) return MISSING;
  if (!settled.has(knowledgeRevision)) return PENDING;
  const facts = settled.get(knowledgeRevision)?.records[documentId];
  return facts ? { status: "loaded", facts } : MISSING;
}

/** The reviewed record behind a cited document, from the facts of the answer's own knowledge revision. */
export function useOakRecordFacts(documentId: string, knowledgeRevision: string): OakRecordFactsState {
  const [, refresh] = React.useReducer((count: number) => count + 1, 0);
  React.useEffect(() => {
    if (!REVISION.test(knowledgeRevision) || cached(knowledgeRevision)) return;
    let live = true;
    void loadOakRecordFacts(knowledgeRevision).then(() => { if (live) refresh(); });
    return () => { live = false; };
  }, [knowledgeRevision]);
  return oakRecordFactsState(documentId, knowledgeRevision);
}
