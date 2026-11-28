import { createHash } from "node:crypto";
import { applyPassageExceptions } from "./eligibility.ts";
import type { ProfileRecord, SourceDocument, PassageException } from "./types.ts";

type Candidate = Readonly<{ id: string; kind: SourceDocument["kind"]; title: string; canonicalUrl: string;
  published?: string; reason: string; gaps?: readonly string[]; profileRecord: unknown }>;
type Review = Readonly<{ sourceFingerprint: string; exceptions?: readonly PassageException[];
  publicQualifiers?: readonly string[]; publicCollaborators?: readonly string[] }>;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const date = (value: unknown) => typeof value === "string" && /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value) &&
  !Number.isNaN(Date.parse(value)) && (value.length < 10 || new Date(value).toISOString().slice(0, 10) === value);
const https = (value: unknown) => {
  if (!nonempty(value)) return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
};
function object(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !(key in value))) {
    throw new Error("Invalid profile record fields");
  }
}
function strings(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || !value.every(nonempty)) throw new Error("Invalid profile record strings");
}
export function assertProfileRecord(value: unknown): asserts value is ProfileRecord {
  object(value, ["schema", "family", "author", "subject", "displayedName", "identity", "role", "period", "issuer", "issued",
    "expiry", "statements", "qualifiers", "collaborators", "disclosure", "conflicts", "sources", "review"]);
  if (value.schema !== "oak.profile-record.v1" || !["profile", "experience", "credential"].includes(String(value.family)) ||
      !["matched", "unresolved"].includes(String(value.identity)) || !["public", "contact-only", "private"].includes(String(value.disclosure)) ||
      ![value.author, value.subject, value.role].every(nonempty) ||
      [value.displayedName, value.period, value.issuer].some((item) => item !== null && !nonempty(item)) ||
      (value.issued !== null && !date(value.issued))) throw new Error("Invalid profile record identity or dates");
  object(value.expiry, ["status", "date"]);
  if (!["unknown", "no-expiry", "dated"].includes(String(value.expiry.status)) ||
      (value.expiry.status === "dated" ? !date(value.expiry.date) : value.expiry.date !== null)) throw new Error("Invalid credential expiry");
  for (const field of [value.qualifiers, value.collaborators, value.conflicts]) strings(field);
  if (!Array.isArray(value.statements)) throw new Error("Invalid selected profile statements");
  const ids = new Set();
  for (const statement of value.statements) {
    object(statement, ["id", "text"]);
    if (!nonempty(statement.id) || !/^[a-z0-9][a-z0-9-]*$/.test(statement.id) || ids.has(statement.id) || !nonempty(statement.text)) {
      throw new Error("Invalid or duplicate profile statement identity");
    }
    ids.add(statement.id);
  }
  if (!Array.isArray(value.sources) || !value.sources.length) throw new Error("Profile record needs public provenance");
  for (const source of value.sources) {
    object(source, ["url", "observedAt", "attribution", "verification"]);
    if (!https(source.url) || !date(source.observedAt) ||
        !["owner-authored", "issuer", "retrieved-public-snapshot"].includes(String(source.attribution)) ||
        !["verified", "unverified"].includes(String(source.verification))) throw new Error("Invalid profile provenance");
  }
  object(value.review, ["state", "date", "authority"]);
  if (!["pending", "owner-reviewed", "excluded"].includes(String(value.review.state)) ||
      (value.review.date !== null && !date(value.review.date)) ||
      (value.review.authority !== null && !nonempty(value.review.authority)) ||
      (value.review.state === "owner-reviewed" && (!date(value.review.date) || !nonempty(value.review.authority)))) {
    throw new Error("Invalid owner review");
  }
}

// No network, account import, private archive or visitor input is accepted here.
// The existing intake owner and review ledger both participate in admission.
export function projectProfileRecord(candidate: Candidate, rule: Review | undefined, authority: string): SourceDocument {
  assertProfileRecord(candidate.profileRecord);
  const record = candidate.profileRecord;
  if (!nonempty(candidate.id) || !/^[a-z0-9-]+:[a-z0-9-]+$/.test(candidate.id) ||
      !nonempty(candidate.title) || !https(candidate.canonicalUrl) ||
      !(record.family === candidate.kind || (record.family === "profile" && candidate.kind === "external-profile"))) {
    throw new Error("Profile intake identity/kind mismatch");
  }
  const sourceFingerprint = hash(candidate);
  const gaps = [...(candidate.gaps ?? [])];
  if (record.review.state !== "owner-reviewed") gaps.push(candidate.reason);
  if (record.identity !== "matched" || !record.displayedName) gaps.push("Displayed-name identity remains unresolved.");
  if (!record.statements.length) gaps.push("Selected owner-reviewed statements are absent.");
  if (record.family === "credential" && (!record.issuer || !record.issued)) gaps.push("Exact credential issuer or issue date remains unresolved.");
  if (record.family === "credential" && candidate.published && candidate.published !== record.issued) gaps.push("Intake date and credential issue date conflict.");
  gaps.push(...record.conflicts);
  const ready = record.review.state === "owner-reviewed" && record.identity === "matched" && !!record.displayedName &&
    record.statements.length > 0 && record.conflicts.length === 0 && (candidate.gaps?.length ?? 0) === 0 &&
    (record.family !== "credential" || (!!record.issuer && !!record.issued)) &&
    (record.family !== "credential" || !candidate.published || candidate.published === record.issued);
  let decision: SourceDocument["decision"];
  // Profile-level exclusion is not a retrieval disposition by itself. The corpus
  // applies only the separate exact-fingerprint retrieval-exclusion ledger.
  if (!ready) decision = { state: "pending", reason: gaps.join(" ") };
  else if (!rule || rule.sourceFingerprint !== sourceFingerprint) {
    decision = { state: "pending", reason: rule ? "Source changed since scoped review." : "Exact record fingerprint needs scoped review." };
  } else {
    if (!Array.isArray(rule.publicQualifiers) || !Array.isArray(rule.publicCollaborators)) throw new Error("Profile record needs curated public attribution");
    strings(rule.publicQualifiers); strings(rule.publicCollaborators);
    if (record.qualifiers.some((text) => !rule.publicQualifiers!.includes(text)) ||
        record.collaborators.some((text) => !rule.publicCollaborators!.includes(text))) throw new Error("Profile attribution differs from scoped review");
    decision = { state: "historical-baseline", sourceFingerprint, basis: authority };
  }
  const context = [`${candidate.title}.`, "Historical source statement. Current status is not established by this record.", `Subject: ${record.subject}. Displayed name: ${record.displayedName ?? "unresolved"}.`,
    `Role: ${record.role}.`, ...(record.period ? [`Source period: ${record.period}.`] : []),
    ...(record.family === "credential" ? [`Issuer: ${record.issuer ?? "unknown"}. Issued: ${record.issued ?? "unknown"}.`,
      `Expiry: ${record.expiry.status}${record.expiry.date ? ` (${record.expiry.date})` : ""}.`] : []),
    ...record.qualifiers, ...(record.collaborators.length ? [`Collaborators: ${record.collaborators.join("; ")}.`] : []),
    ...record.sources.map((source) => `Source: ${source.url}, observed ${source.observedAt}, ${source.attribution}, verification ${source.verification}.`)];
  const passages = record.statements.map((statement) => applyPassageExceptions({ id: `${candidate.id}:${statement.id}`,
    sectionId: candidate.id, kind: "narrative", text: [...context, statement.text].join(" "),
    headingPath: [candidate.title], citationUrl: candidate.canonicalUrl, disclosure: record.disclosure,
    conflict: record.conflicts.length ? record.conflicts.join(" | ") : null }, rule?.exceptions ?? []));
  return { id: candidate.id, kind: record.family, title: candidate.title, canonicalUrl: candidate.canonicalUrl,
    sourceFingerprint, sourceFiles: ["knowledge/external-candidates.json"], representations: [candidate.canonicalUrl],
    sourceFamily: "owner-profile-record", provenance: record.sources.map((source) => ({ ...source })),
    dates: { published: record.family === "credential" ? null : candidate.published ?? null, updated: null, period: record.period, inspected: record.sources[0].observedAt, factualReview: record.review.date },
    ownership: { author: record.author, subject: record.subject, role: record.role, contributions: [],
      qualifiers: [...record.qualifiers], collaborators: [...record.collaborators],
      publicQualifiers: [...(rule?.publicQualifiers ?? [])], publicCollaborators: [...(rule?.publicCollaborators ?? [])] },
    decision, disclosure: record.disclosure, gaps: [...new Set(gaps)], passages };
}
