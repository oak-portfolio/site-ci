import { z } from 'zod';
import { documentContextSchema, documentLimits, documentContentSchema, docxOriginalSourceSchema } from './documents.ts';
import { oakTransportSchema } from './transport.ts';

// The complete client-held outputs are decoded and verified inside the document DO.
export const documentChatBodySchema = z.strictObject({
  envelope: oakTransportSchema,
  outputs: documentContextSchema.shape.outputs,
  selections: documentContextSchema.shape.selections,
});
const count = z.number().int().nonnegative().max(196_608);
export const selectedDocumentContextSchema = z.strictObject({
  authority: z.literal('visitor-text-only'), offsetUnit: z.literal('utf16'),
  // Derived only after the DO verifies the selected output receipts and current source.
  excerpts: z.array(z.strictObject({
    sourceId: z.string().min(1).max(240), label: z.enum(['Document 1','Document 2','Document 3']),
    originalSource: docxOriginalSourceSchema.optional(),
    sourcePage: z.number().int().min(1).max(20).optional(),
    sectionId: z.string().regex(/^section-[1-9][0-9]{0,2}$/),
    start: count, end: count, text: z.string().min(1).max(65_536),
    warnings: documentContentSchema.shape.warnings,
    extractionCompleteness: z.enum(['complete', 'unknown']),
  }).refine(value => value.end > value.start && value.end - value.start === value.text.length &&
    !(value.originalSource && value.sourcePage !== undefined))).min(1).max(24),
  includedUtf16: count, availableUtf16: count, omittedUtf16: count,
  coverage: z.literal('selected-spans-only'),
}).superRefine((value, ctx) => {
  if (value.includedUtf16 + value.omittedUtf16 !== value.availableUtf16 ||
      value.excerpts.reduce((sum, excerpt) => sum + excerpt.text.length, 0) !== value.includedUtf16 ||
      new TextEncoder().encode(JSON.stringify(value)).byteLength > documentLimits.contextBytes)
    ctx.addIssue({ code: 'custom', message: 'Invalid selected document coverage.' });
});
export const validatedDocumentChatSchema = z.strictObject({
  envelope: oakTransportSchema, context: selectedDocumentContextSchema,
});
export type SelectedDocumentContext = z.infer<typeof selectedDocumentContextSchema>;
