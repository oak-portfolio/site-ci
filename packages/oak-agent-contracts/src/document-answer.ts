import { z } from 'zod';
import { docxOriginalSourceSchema } from './documents.ts';

const position = z.number().int().nonnegative().max(65_536);
const count = z.number().int().nonnegative().max(196_608);
const sourcePattern = /^visitor-document:([a-f0-9-]{36}):(section-[1-9][0-9]{0,2}):([0-9]+)-([0-9]+)$/;
/** Identifies a selected private excerpt, never an approved public knowledge passage. */
export function privateDocumentSource(value: string) {
  const match = sourcePattern.exec(value);
  if (!match || !z.uuid().safeParse(match[1]).success) return null;
  const start = Number(match[3]), end = Number(match[4]);
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end > start && end <= 65_536
    ? { documentId: match[1]!, sectionId: match[2]!, start, end } : null;
}
export const privateDocumentSourceIdSchema = z.string().max(240).refine(value => privateDocumentSource(value) !== null);
export const privateDocumentCitationSchema = z.strictObject({
  sourceId: privateDocumentSourceIdSchema,
  label: z.enum(['Document 1', 'Document 2', 'Document 3']),
  originalSource: docxOriginalSourceSchema.optional(),
  sourcePage: z.number().int().min(1).max(20).optional(),
  sectionId: z.string().regex(/^section-[1-9][0-9]{0,2}$/),
  start: position, end: position,
  offsetUnit: z.literal('utf16'), authority: z.literal('visitor-text-only'),
}).refine(value => {
  const source = privateDocumentSource(value.sourceId);
  return source !== null && source.sectionId === value.sectionId && value.end > value.start &&
    value.start >= source.start && value.end <= source.end && !(value.originalSource && value.sourcePage !== undefined);
});
export type PrivateDocumentCitation = z.infer<typeof privateDocumentCitationSchema>;
export const documentCoverageSchema = z.strictObject({
  scope: z.literal('selected-spans-only'), offsetUnit: z.literal('utf16'),
  includedUtf16: count, availableUtf16: count, omittedUtf16: count, quotedUtf16: count,
  extractionCompleteness: z.enum(['complete', 'unknown']),
}).refine(value => value.includedUtf16 > 0 && value.includedUtf16 + value.omittedUtf16 === value.availableUtf16 &&
  value.quotedUtf16 > 0 && value.quotedUtf16 <= value.includedUtf16);
export type DocumentCoverage = z.infer<typeof documentCoverageSchema>;
export const documentClaimSchema = z.strictObject({
  id: z.string().regex(/^document-claim-[1-8]$/), quote: z.string().min(1).max(400),
  citation: privateDocumentCitationSchema,
}).refine(value => value.quote.trim().length > 0 && value.quote.length === value.citation.end - value.citation.start);

/** Canonical spans cannot overlap or introduce a fourth document. */
export function validPrivateCitationSet(citations: readonly PrivateDocumentCitation[]) {
  const documents = new Map<string, Array<{ start: number; end: number }>>();
  for (const citation of citations) {
    const source = privateDocumentSource(citation.sourceId);
    if (!source) return false;
    const prior = documents.get(source.documentId) ?? [];
    if (prior.some(span => citation.start < span.end && citation.end > span.start)) return false;
    prior.push(citation); documents.set(source.documentId, prior);
  }
  return documents.size <= 3;
}
export const documentAnswerFieldsSchema = z.strictObject({
  claims: z.array(documentClaimSchema).min(1).max(8), coverage: documentCoverageSchema,
}).refine(value => new Set(value.claims.map(claim => claim.id)).size === value.claims.length &&
  value.claims.reduce((sum, claim) => sum + claim.quote.length, 0) === value.coverage.quotedUtf16 &&
  validPrivateCitationSet(value.claims.map(claim => claim.citation)));
export type DocumentAnswerFields = z.infer<typeof documentAnswerFieldsSchema>;
export const documentRequirementSourceSchema = z.strictObject({
  kind: z.literal('document'), sourceIds: z.array(privateDocumentSourceIdSchema).min(1).max(3),
}).refine(value => new Set(value.sourceIds).size === value.sourceIds.length &&
  new Set(value.sourceIds.map(id => privateDocumentSource(id)!.documentId)).size <= 3);
export type DocumentRequirementSource = z.infer<typeof documentRequirementSourceSchema>;
export const documentRoleRequirementSchema = z.strictObject({
  text: z.string().min(1).max(240), start: position, end: position, source: privateDocumentCitationSchema,
}).refine(value => value.text.trim().length > 0 && value.end > value.start && value.end - value.start === value.text.length &&
  value.start === value.source.start && value.end === value.source.end);

export function privateDocumentCitationLabel(citation: PrivateDocumentCitation) {
  const source = citation.originalSource;
  const position = citation.sourcePage !== undefined ? `Page ${citation.sourcePage}` : source ? source.kind === 'table-cell'
    ? `Body table block ${source.bodyBlock}, row ${source.row}, cell ${source.cell}, paragraph ${source.paragraph}`
    : `Body ${source.kind} block ${source.bodyBlock}` : `Extracted text block ${citation.sectionId.slice('section-'.length)}`;
  return `${citation.label}, ${position}, characters ${citation.start + 1}–${citation.end}`;
}
/** Same readable coverage survives live rendering, saved history and export. */
export function documentCoverageText(coverage: DocumentCoverage) {
  const unquoted = coverage.includedUtf16 - coverage.quotedUtf16;
  return [
    `Quoted ${coverage.quotedUtf16} of the ${coverage.includedUtf16} selected characters.`,
    ...(unquoted ? [`${unquoted} selected characters are outside these quotes.`] : []),
    ...(coverage.omittedUtf16 ? [`${coverage.omittedUtf16} extracted text characters were not selected for this answer.`] : []),
    ...(coverage.extractionCompleteness === 'unknown' ? ['Original content missing from extraction is unknown. Check the extracted text against your original.'] : []),
  ].join(' ');
}
