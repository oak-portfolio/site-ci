import { projectProfileRecord } from "./profile-records.ts";
import { selectEligibleDocuments } from "./eligibility.ts";
import type { ProfileRecord } from "./types.ts";
import type { PublicCredentialRecord, PublicCredentialStatement } from "./publicCredentialText.ts";

type Candidate = Parameters<typeof projectProfileRecord>[0];
type ReviewRule = NonNullable<Parameters<typeof projectProfileRecord>[1]>;

type SnapshotPassage = Readonly<{
  id: string;
  sectionId: string;
  kind: string;
  text: string;
  headingPath: readonly string[];
  citationUrl: string;
}>;

type SnapshotDocument = Readonly<{
  id: string;
  kind: string;
  title: string;
  canonicalUrl: string;
  evidenceScope?: string;
  attribution?: Readonly<{ qualifiers?: readonly string[] }>;
  passages: readonly SnapshotPassage[];
}>;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameStrings(left: readonly string[] | undefined, right: readonly string[]) {
  return Array.isArray(left) && JSON.stringify(left) === JSON.stringify(right);
}

function matchesActiveProjection(projected: ReturnType<typeof projectProfileRecord>, active: SnapshotDocument | undefined) {
  if (!active || active.id !== projected.id || active.kind !== "credential" || active.title !== projected.title ||
      active.canonicalUrl !== projected.canonicalUrl || active.evidenceScope !== "historical-source" ||
      !sameStrings(active.attribution?.qualifiers, projected.ownership.publicQualifiers)) return false;

  const [eligible] = selectEligibleDocuments([projected]);
  if (!eligible || active.passages.length !== eligible.passages.length) return false;
  return eligible.passages.every((expected, index) => {
    const actual = active.passages[index];
    return actual?.id === expected.id && actual.sectionId === expected.sectionId &&
      actual.kind === expected.kind && actual.text === expected.text &&
      JSON.stringify(actual.headingPath) === JSON.stringify(expected.headingPath) &&
      actual.citationUrl === expected.citationUrl;
  });
}

/**
 * Projects exact reviewed credential statements only when the same record is
 * already present in the active public snapshot. Preview-only intake stays out.
 */
export function projectPublicCredentialStatements(input: Readonly<{
  candidates: readonly unknown[];
  reviewLedger: unknown;
  activeSnapshot: unknown;
}>): readonly PublicCredentialRecord[] {
  if (!isObject(input.reviewLedger) || input.reviewLedger.schema !== "oak.knowledge-review.v1" ||
      typeof input.reviewLedger.authority !== "string" || !input.reviewLedger.authority.trim() ||
      !isObject(input.reviewLedger.documents)) throw new Error("Invalid public credential review ledger");
  if (!isObject(input.activeSnapshot) || input.activeSnapshot.schema !== "oak.public-knowledge.v2" ||
      !Array.isArray(input.activeSnapshot.documents)) throw new Error("Invalid active public knowledge snapshot");

  const reviewDocuments = input.reviewLedger.documents;
  const activeDocuments = input.activeSnapshot.documents as SnapshotDocument[];
  const results: PublicCredentialRecord[] = [];
  for (const raw of input.candidates) {
    if (!isObject(raw) || raw.kind !== "credential" || !raw.profileRecord) continue;
    const candidate = raw as Candidate;
    const rule = reviewDocuments[candidate.id] as ReviewRule | undefined;
    const projected = projectProfileRecord(candidate, rule, input.reviewLedger.authority);
    if (projected.kind !== "credential" || projected.decision.state !== "historical-baseline" ||
        projected.sourceFingerprint !== projected.decision.sourceFingerprint) continue;
    const [eligible] = selectEligibleDocuments([projected]);
    const active = activeDocuments.find((document) => document.id === projected.id);
    if (!eligible || !matchesActiveProjection(projected, active)) continue;
    const sourceStatements = new Map((candidate.profileRecord as ProfileRecord).statements.map((statement) => [
      `${projected.id}:${statement.id}`, statement.text,
    ]));
    const statements = eligible.passages.map((passage) => {
      const text = sourceStatements.get(passage.id);
      return text ? { text, citationUrl: passage.citationUrl } : undefined;
    });
    if (statements.some((statement) => !statement)) continue;

    results.push({
      title: projected.title,
      statements: statements as PublicCredentialStatement[],
      publicQualifiers: [...projected.ownership.publicQualifiers],
    });
  }
  return results.sort((left, right) => left.title.localeCompare(right.title));
}
