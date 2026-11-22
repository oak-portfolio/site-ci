import { z } from 'zod';
import { documentContentSchema, documentLimits, documentOperationSchema, documentOutputSchema,
  documentSelectionSchema, outputClaimSchema, documentProcessorRevision, type DocumentOutput } from './documents.ts';

/** Durable normalized content only. Originals, names and live bearer receipts are excluded. */
export const savedDocumentSchema = documentContentSchema.safeExtend({
  label: z.string().regex(/^Document [1-3]$/),
  parserRevision: outputClaimSchema.shape.parserRevision,
  processorRevision: outputClaimSchema.shape.processorRevision,
}).strict();
export type SavedDocument = z.infer<typeof savedDocumentSchema>;

const boundary = (text: string, index: number) => !(index > 0 && index < text.length &&
  /[\uD800-\uDBFF]/.test(text[index - 1]!) && /[\uDC00-\uDFFF]/.test(text[index]!));
export const savedDocumentSetSchema = z.strictObject({
  documents: z.array(savedDocumentSchema).max(documentLimits.files),
  selections: z.array(documentSelectionSchema).max(documentLimits.selections),
}).superRefine((value, context) => {
  const ids = new Set<string>(), slots = new Set<number>();
  let bytes = 0, tokens = 0;
  for (const [index, doc] of value.documents.entries()) {
    const issue = (message: string) => context.addIssue({ code: 'custom', path: ['documents', index], message });
    if (ids.has(doc.documentId) || new Set(doc.slots).size !== doc.slots.length || doc.slots.some(slot => slots.has(slot))) issue('Duplicate document or slot.');
    ids.add(doc.documentId); doc.slots.forEach(slot => slots.add(slot));
    if (doc.label !== `Document ${Math.min(...doc.slots) + 1}`) issue('A document needs its generated slot label.');
    if (!doc.text.trim() || /\p{Surrogate}/u.test(doc.text) || new TextEncoder().encode(doc.text).byteLength !== doc.normalizedBytes) issue('Invalid normalized text.');
    let end = 0, sourceEnd: number | undefined;
    for (const [i, section] of doc.sections.entries()) {
      if (section.id !== `section-${i + 1}` || section.start !== end || section.end <= section.start || section.end > doc.text.length ||
          section.sourceEnd < section.sourceStart || (sourceEnd !== undefined && section.sourceStart !== sourceEnd) ||
          !boundary(doc.text, section.start) || !boundary(doc.text, section.end)) issue('Invalid genuine section spans.');
      end = section.end; sourceEnd = section.sourceEnd;
    }
    if (end !== doc.text.length) issue('Sections must cover the normalized text.');
    const local = doc.kind === 'paste' || doc.kind === 'txt';
    if (doc.extractionCompleteness !== (local ? 'complete' : 'unknown') ||
        doc.processorRevision !== documentProcessorRevision(doc)) issue('Invalid extraction coverage or processor.');
    bytes += doc.normalizedBytes * doc.slots.length; tokens += doc.tokens * doc.slots.length;
  }
  if (slots.size && [...slots].some(slot => slot >= slots.size)) context.addIssue({ code: 'custom', message: 'Saved slots must retain the complete intake set.' });
  if (bytes > documentLimits.submissionTextBytes || tokens > documentLimits.tokens) context.addIssue({ code: 'custom', message: 'Document set exceeds intake limits.' });
  const selected = new Map<string, Array<{ start: number; end: number }>>();
  for (const [index, selection] of value.selections.entries()) {
    const doc = value.documents.find(doc => doc.documentId === selection.documentId), section = doc?.sections.find(section => section.id === selection.sectionId);
    const prior = selected.get(selection.documentId) ?? [];
    if (!doc || !section || selection.start < section.start || selection.end > section.end || selection.end <= selection.start ||
        !boundary(doc.text, selection.start) || !boundary(doc.text, selection.end) || prior.some(span => selection.start < span.end && selection.end > span.start)) {
      context.addIssue({ code: 'custom', path: ['selections', index], message: 'Invalid selected span.' });
    }
    selected.set(selection.documentId, [...prior, selection]);
  }
});
export type SavedDocumentSet = z.infer<typeof savedDocumentSetSchema>;

/** Transient proof travels only on an explicit document-inclusive command. */
export const savedDocumentProofSchema = z.strictObject({
  operation: documentOperationSchema.omit({ principalHash: true }),
  outputs: z.array(documentOutputSchema).min(1).max(documentLimits.files),
  selections: z.array(documentSelectionSchema).max(documentLimits.selections),
});
export type SavedDocumentProof = z.infer<typeof savedDocumentProofSchema>;
export const reopenedSavedDocumentsSchema = z.strictObject({
  operation: documentOperationSchema,
  outputs: z.array(documentOutputSchema).min(1).max(documentLimits.files),
  selections: z.array(documentSelectionSchema).max(documentLimits.selections),
});
export type ReopenedSavedDocuments = z.infer<typeof reopenedSavedDocumentsSchema>;

export function durableSavedDocuments(outputs: DocumentOutput[], selections: SavedDocumentSet['selections']): SavedDocumentSet {
  return savedDocumentSetSchema.parse({ documents: outputs.map(output => {
    const { receipt, ...content } = output;
    return { ...content, label: `Document ${Math.min(...output.slots) + 1}`,
      parserRevision: receipt.payload.parserRevision, processorRevision: receipt.payload.processorRevision };
  }), selections });
}
