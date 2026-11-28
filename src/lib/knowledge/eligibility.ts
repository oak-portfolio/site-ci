import type { Disclosure, EvidencePassage, EligibleDocument, PassageException, SourceDocument } from "./types.ts";

export const contactOnlyTopics = ["steve-pricing", "steve-compensation", "steve-rates", "steve-availability", "steve-start-date"] as const;

const disclosureRank: Readonly<Record<Disclosure, number>> = { public: 0, "contact-only": 1, private: 2 };

export function strictestDisclosure(values: readonly (Disclosure | null | undefined)[]): Disclosure {
  return values.reduce<Disclosure>((strictest, value) =>
    value && disclosureRank[value] > disclosureRank[strictest] ? value : strictest, "public");
}

export function combineConflicts(values: readonly (string | null | undefined)[]): string | null {
  const conflicts = [...new Set(values.filter((value): value is string => typeof value === "string"))].sort();
  return conflicts.length ? conflicts.join(" | ") : null;
}

export function applyPassageExceptions(passage: EvidencePassage, exceptions: readonly PassageException[]): EvidencePassage {
  const sections = passage.sectionReferences ?? [{ id: passage.sectionId,
    heading: passage.headingPath.at(-1) ?? "", anchor: passage.citationUrl.split("#")[1] ?? "" }];
  const matches = exceptions.filter((entry) => entry.sectionId === passage.sectionId ||
    sections.some((section) => entry.sectionId === section.id) || entry.passageId === passage.id ||
    (entry.textIncludes !== undefined && passage.text.includes(entry.textIncludes)));
  const denied = matches.filter((entry) => (entry.disclosure !== undefined && entry.disclosure !== "public") || entry.conflict !== undefined);
  const deniedReferences = [...new Set([...(passage.deniedReferences ?? []), ...denied.flatMap((entry) => [
    ...(entry.sectionId ? sections.filter((section) => section.id === entry.sectionId)
      .flatMap((section) => [section.heading, section.anchor ?? ""]) : []), entry.textIncludes ?? "",
  ]).filter(Boolean)])];
  return { ...passage,
    disclosure: strictestDisclosure([passage.disclosure, ...matches.map((entry) => entry.disclosure)]),
    conflict: combineConflicts([passage.conflict, ...matches.map((entry) => entry.conflict)]),
    ...(deniedReferences.length ? { deniedReferences } : {}) };
}

function metadataStrings(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(metadataStrings);
  return [];
}

const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

export function selectEligibleDocuments(documents: readonly SourceDocument[]): readonly EligibleDocument[] {
  return documents.flatMap((document) => {
    if (document.disclosure !== "public" || document.decision.state !== "historical-baseline" ||
        document.sourceFingerprint !== document.decision.sourceFingerprint) return [];
    const deniedText = [...(document.deniedReferences ?? []), ...document.passages.filter((passage) => passage.disclosure !== "public" || passage.conflict !== null)
      .flatMap((passage) => [passage.text, ...(passage.deniedReferences ?? [])])].map(normalize).filter(Boolean);
    const metadata = metadataStrings({ id: document.id, title: document.title, canonicalUrl: document.canonicalUrl,
      dates: document.dates, ownership: document.ownership, provenance: document.provenance,
      passageReferences: document.passages.filter((passage) => passage.disclosure === "public" && passage.conflict === null)
        .map((passage) => ({ id: passage.id, sectionId: passage.sectionId,
          text: passage.text, headingPath: passage.headingPath, citationUrl: passage.citationUrl })) })
      .map(normalize).filter(Boolean);
    if (metadata.some((value) => deniedText.some((text) => value.includes(text) || text.includes(value)))) return [];
    const passages = document.passages.filter((passage) =>
      passage.disclosure === "public" && passage.conflict === null && passage.text.trim().length > 0
    ).map(({ disclosure: _disclosure, conflict: _conflict, deniedReferences: _deniedReferences,
      sectionReferences: _sectionReferences, ...passage }) => passage);
    if (passages.length === 0) return [];
    return [{ id: document.id, kind: document.kind, title: document.title,
      canonicalUrl: document.canonicalUrl, dates: document.dates, ownership: document.ownership,
      evidenceScope: "historical-source" as const,
      ...(document.sourceFamily ? { sourceFamily: document.sourceFamily, provenance: document.provenance } : {}), passages }];
  });
}

export function selectAnswerEvidence(input: Readonly<{
  documents: readonly SourceDocument[];
  topic: string;
}>): Readonly<{ kind: "contact-steve"; documents: readonly [] }> |
    Readonly<{ kind: "evidence"; documents: readonly EligibleDocument[] }> {
  if (contactOnlyTopics.some((topic) => topic === input.topic)) {
    return { kind: "contact-steve", documents: [] };
  }
  return { kind: "evidence", documents: selectEligibleDocuments(input.documents) };
}
