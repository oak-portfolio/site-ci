export type Disclosure = "public" | "contact-only" | "private";
export type ReviewDecision =
  | Readonly<{ state: "historical-baseline"; sourceFingerprint: string; basis: string }>
  | Readonly<{ state: "pending" | "excluded"; reason: string }>;

export type Ownership = Readonly<{
  author: string;
  subject: string;
  role: string;
  contributions: readonly string[];
  collaborators: readonly string[];
  publicCollaborators: readonly string[];
  qualifiers: readonly string[];
  publicQualifiers: readonly string[];
}>;

export type SourceDates = Readonly<{
  published: string | null;
  updated: string | null;
  period: string | null;
  inspected: string;
  factualReview: string | null;
}>;

export type EvidencePassage = Readonly<{
  id: string;
  sectionId: string;
  kind: "narrative" | "table" | "caption" | "resource";
  text: string;
  headingPath: readonly string[];
  citationUrl: string;
  disclosure: Disclosure;
  conflict: string | null;
  deniedReferences?: readonly string[];
  sectionReferences?: readonly Readonly<{ id: string; heading: string; anchor?: string }>[];
}>;

export type SourceDocument = Readonly<{
  id: string;
  kind: "profile" | "experience" | "work" | "resource" | "legacy" | "credential" | "external-profile";
  title: string;
  canonicalUrl: string;
  sourceFingerprint: string;
  sourceFiles: readonly string[];
  representations: readonly string[];
  sourceFamily?: "owner-profile-record";
  provenance?: readonly ProfileRecordSource[];
  dates: SourceDates;
  ownership: Ownership;
  disclosure: Disclosure;
  decision: ReviewDecision;
  gaps: readonly string[];
  deniedReferences?: readonly string[];
  passages: readonly EvidencePassage[];
}>;

export type EligibleDocument = Readonly<{
  id: string;
  kind: SourceDocument["kind"];
  title: string;
  canonicalUrl: string;
  dates: SourceDates;
  ownership: Ownership;
  evidenceScope: "historical-source";
  sourceFamily?: "owner-profile-record";
  provenance?: readonly ProfileRecordSource[];
  passages: readonly Omit<EvidencePassage, "disclosure" | "conflict" | "deniedReferences" | "sectionReferences">[];
}>;

export type PassageException = Readonly<{
  sectionId?: string;
  passageId?: string;
  textIncludes?: string;
  disclosure?: Disclosure;
  conflict?: string;
}>;

// Structured, selected public intake. Review identity is distinct from issuer verification.
export type ProfileRecordSource = Readonly<{
  url: string;
  observedAt: string;
  attribution: "owner-authored" | "issuer" | "retrieved-public-snapshot";
  verification: "verified" | "unverified";
}>;
export type ProfileRecord = Readonly<{
  schema: "oak.profile-record.v1";
  family: "profile" | "experience" | "credential";
  author: string;
  subject: string;
  displayedName: string | null;
  identity: "matched" | "unresolved";
  role: string;
  period: string | null;
  issuer: string | null;
  issued: string | null;
  expiry: Readonly<{ status: "unknown" | "no-expiry" | "dated"; date: string | null }>;
  statements: readonly Readonly<{ id: string; text: string }>[];
  qualifiers: readonly string[];
  collaborators: readonly string[];
  disclosure: Disclosure;
  conflicts: readonly string[];
  sources: readonly ProfileRecordSource[];
  review: Readonly<{ state: "pending" | "owner-reviewed" | "excluded"; date: string | null; authority: string | null }>;
}>;
