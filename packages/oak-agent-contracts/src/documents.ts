import { z } from "zod";
export const documentLimits = Object.freeze({
  files: 3,
  fileBytes: 5_000_000,
  submissionBytes: 10_000_000,
  pdfPages: 20,
  normalizedBytes: 65_536,
  submissionTextBytes: 131_072,
  sections: 256,
  tokens: 32_000,
  contextBytes: 8_000,
  selections: 24,
  lifetimeMs: 30 * 60_000,
  operationMs: 30_000,
  leaseMs: 35_000,
});
const uuid = z.uuid(),
  digest = z.string().regex(/^[a-f0-9]{64}$/),
  principal = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const n = (max = Number.MAX_SAFE_INTEGER) => z.number().int().min(0).max(max);
export const documentKindSchema = z.enum(["paste", "txt", "docx", "pdf"]);
export type DocumentKind = z.infer<typeof documentKindSchema>;
export const pdfCounterSchema = z
  .object({
    visited: n(524_288),
    tokens: n(131_072),
    xref: n(8192),
    objects: n(512),
    pageNodes: n(256),
  })
  .strict();
export type PdfCounters = z.infer<typeof pdfCounterSchema>;
export const documentBindingSchema = z
  .object({ principalHash: principal, conversationId: uuid })
  .strict();
export type DocumentBinding = z.infer<typeof documentBindingSchema>;
export const documentOperationSchema = documentBindingSchema
  .extend({ submissionId: uuid, generation: n() })
  .strict();
export type DocumentOperation = z.infer<typeof documentOperationSchema>;
/** Server-authored bounded inspection of the exact original, never converter-option evidence. */
export const documentMediaEligibilitySchema = z.object({
  revision: z.literal("t18-media-v1"),
  status: z.enum(["image-free", "image-present", "uncertain", "not-applicable"]),
  reason: z.enum(["none", "image", "unsupported", "inspection-limit"]),
}).strict().superRefine((value, context) => {
  const valid = value.status === "uncertain" ? ["unsupported", "inspection-limit"].includes(value.reason)
    : value.reason === (value.status === "image-present" ? "image" : "none");
  if (!valid) context.addIssue({ code: "custom", message: "Inconsistent media eligibility." });
});
export type DocumentMediaEligibility = z.infer<typeof documentMediaEligibilitySchema>;
/** Fixed content-free findings for current intake. Legacy output warnings stay compatible. */
export const documentWarningCodes = ['line-ending-normalized','no-factual-authority',
  'source-sections-unverified','processor-coverage-unverified','reading-order-unverified',
  'tables-coverage-unverified','headers-coverage-unverified','footers-coverage-unverified',
  'comments-coverage-unverified','footnotes-coverage-unverified','endnotes-coverage-unverified',
  'external-relationships-not-fetched-by-preflight','page-count-only-no-text-map',
  'docx-layout-unverified','docx-content-omitted','docx-media-not-extracted','docx-fields-not-evaluated',
  'pdf-layout-unverified'] as const;
export const preflightWarningsSchema = z.array(z.enum(documentWarningCodes)).max(12)
  .refine(value => new Set(value).size === value.length, 'Warnings must be unique.');
export function orderedDocumentWarnings(values: readonly string[]) {
  const checked = z.array(z.enum(documentWarningCodes)).max(16).parse([...new Set(values)]);
  return documentWarningCodes.filter(code => checked.includes(code));
}
export const preflightPayloadSchema = documentOperationSchema
  .extend({
    version: z.literal(3),
    slot: n(2),
    expectedSlots: z.number().int().min(1).max(3),
    parserRevision: z.literal("t18-feature-preflight-v4"),
    expiresAt: n(),
    kind: documentKindSchema,
    originalSha256: digest,
    originalBytes: z.number().int().min(1).max(5_000_000),
    pdfPages: n(20),
    pdfStructuralExpandedBytes: n(2_097_152),
    pdfCounters: pdfCounterSchema,
    mediaEligibility: documentMediaEligibilitySchema,
    preflightWarnings: preflightWarningsSchema,
    knownNormalizedBytes: n(65_536).optional(),
    knownTokens: n(32_000).optional(),
    // Signed only after image-free structure and the separate local extractor pass.
    localPdfRevision: z.literal('local-pdf-page-text-v1').optional(),
  })
  .strict().superRefine((value, context) => {
    if (value.localPdfRevision && (value.kind !== 'pdf' || value.pdfPages < 1 ||
        value.mediaEligibility.status !== 'image-free' || !value.knownNormalizedBytes || !value.knownTokens))
      context.addIssue({ code: 'custom', message: 'Invalid local PDF eligibility.' });
  });
export const preflightReceiptSchema = z
  .object({ payload: preflightPayloadSchema, signature: digest })
  .strict();
export type PreflightReceipt = z.infer<typeof preflightReceiptSchema>;
/** Original main-body XML coordinates, not Word pages or raw ZIP/XML character offsets. */
export const docxOriginalSourceSchema = z.object({
  bodyBlock: z.number().int().min(1).max(32_768),
  kind: z.enum(['paragraph', 'heading', 'table-cell']),
  headingLevel: z.number().int().min(1).max(9).optional(),
  row: z.number().int().min(1).max(32_768).optional(),
  cell: z.number().int().min(1).max(32_768).optional(),
  paragraph: z.number().int().min(1).max(32_768).optional(),
}).strict().superRefine((value, context) => {
  if ((value.kind === 'heading') !== (value.headingLevel !== undefined) ||
      (value.kind === 'table-cell' ? [value.row,value.cell,value.paragraph].some(v => v === undefined)
        : [value.row,value.cell,value.paragraph].some(v => v !== undefined)))
    context.addIssue({code:'custom',message:'Inconsistent original DOCX block.'});
});
export type DocxOriginalSource = z.infer<typeof docxOriginalSourceSchema>;
/** Parser text order only. The provider supplies no PDF page or completeness coordinates.
 * Parser engines return a file annotation; 'native' (Gemini reads the PDF itself, ADR 0004) returns none. */
export const ocrSourceSchema = z.strictObject({
  quoteId: uuid, originalSha256: digest, receiptId: digest, annotationDigest: digest.optional(),
  engine: z.enum(['mistral-ocr', 'cloudflare-ai', 'native']),
}).refine(value => (value.engine === 'native') === (value.annotationDigest === undefined),
  'Parser engines carry their file annotation; native reading carries none.');
export const documentSectionSchema = z
  .object({
    id: z.string().regex(/^section-[1-9][0-9]{0,2}$/),
    start: n(),
    end: n(),
    sourceStart: n(),
    sourceEnd: n(),
    originalSource: docxOriginalSourceSchema.optional(),
    // Actual 1-based page-tree association. Not a glyph, file-byte or visual-layout coordinate.
    sourcePage: z.number().int().min(1).max(20).optional(),
  })
  .strict();
export const documentContentSchema = z
  .object({
    documentId: uuid,
    slots: z.array(n(2)).min(1).max(3),
    kind: documentKindSchema,
    text: z.string().max(65_536),
    sections: z.array(documentSectionSchema).min(1).max(256),
    offsetUnit: z.literal("utf16"),
    // Mapped sourceStart/sourceEnd index emitted logical text, never PDF bytes or glyphs.
    // PDF order is content-stream order. This does not verify visual reading order.
    sourceMapping: z.enum(["docx-body-order-v1", "pdf-page-order-v1", "openrouter-file-annotation-v1"]).optional(),
    ocrSource: ocrSourceSchema.optional(),
    pdfPages: z.number().int().min(1).max(20).optional(),
    normalizedBytes: n(65_536),
    tokens: n(32_000),
    normalizationComplete: z.literal(true),
    extractionCompleteness: z.enum(["complete", "unknown"]),
    pageMapping: z.enum(["unavailable", "verified-pages", "provider-pages"]),
    warnings: z.array(z.string().regex(/^[a-z0-9-]{1,80}$/)).max(16),
    authority: z.literal("visitor-text-only"),
  })
  .strict().superRefine((value, context) => {
    const docx = value.sourceMapping === 'docx-body-order-v1', pdf = value.sourceMapping === 'pdf-page-order-v1',
      ocr = value.sourceMapping === 'openrouter-file-annotation-v1';
    const invalid = () => context.addIssue({ code: 'custom', message: 'Invalid original source mapping.' });
    if ((docx && value.kind !== 'docx') || ((pdf || ocr) && value.kind !== 'pdf') ||
        (ocr ? value.ocrSource === undefined || value.pdfPages === undefined ||
          value.extractionCompleteness !== 'unknown' || !['no-factual-authority', 'processor-coverage-unverified',
            'reading-order-unverified', 'pdf-layout-unverified', 'page-count-only-no-text-map', 'ocr-visual-content-unverified'].every(w => value.warnings.includes(w))
          : value.ocrSource !== undefined) ||
        value.pageMapping !== (pdf ? 'verified-pages' : 'unavailable') ||
        (pdf ? value.pdfPages === undefined || value.extractionCompleteness !== 'unknown' ||
          !['no-factual-authority', 'processor-coverage-unverified', 'reading-order-unverified', 'pdf-layout-unverified'].every(warning => value.warnings.includes(warning))
          : !ocr && value.pdfPages !== undefined)) invalid();
    const boundary = (index: number) => !(index > 0 && index < value.text.length &&
      /[\uD800-\uDBFF]/.test(value.text[index - 1]!) && /[\uDC00-\uDFFF]/.test(value.text[index]!));
    if (!value.text.trim() || /\p{Surrogate}/u.test(value.text) || new TextEncoder().encode(value.text).byteLength !== value.normalizedBytes ||
        new Set(value.slots).size !== value.slots.length || value.extractionCompleteness !== (value.kind === 'txt' || value.kind === 'paste' ? 'complete' : 'unknown')) invalid();
    let previousPage = 0, end = 0, sourceEnd: number | undefined;
    for (const [index, section] of value.sections.entries()) {
      if ((docx ? !section.originalSource : section.originalSource !== undefined) ||
          ((docx || pdf) && (section.sourceStart !== section.start || section.sourceEnd !== section.end)) ||
          (pdf ? section.sourcePage === undefined || section.sourcePage < previousPage ||
            section.sourcePage > (value.pdfPages ?? 0) : section.sourcePage !== undefined) ||
          section.id !== `section-${index + 1}` || section.start !== end || section.end <= section.start || section.end > value.text.length ||
          section.sourceEnd < section.sourceStart || (sourceEnd !== undefined && section.sourceStart !== sourceEnd) ||
          !boundary(section.start) || !boundary(section.end)) invalid();
      previousPage = section.sourcePage ?? previousPage;
      end = section.end; sourceEnd = section.sourceEnd;
    }
    if (end !== value.text.length) invalid();
  });
/** Receipt processors follow verified source mapping, never caller preference. */
export function documentProcessorRevision(value: Pick<z.infer<typeof documentContentSchema>, 'kind' | 'sourceMapping'>) {
  return value.sourceMapping === 'openrouter-file-annotation-v1' ? 'openrouter-file-parser-v1' as const :
    value.sourceMapping === 'pdf-page-order-v1' ? 'local-pdf-page-text-v1' as const :
    value.sourceMapping === 'docx-body-order-v1' ? 'local-docx-body-v1' as const :
    value.kind === 'txt' || value.kind === 'paste' ? 'local-text-v1' as const : 'cloudflare-to-markdown-text-v1' as const;
}
export const outputProvenanceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('preflight'), parents: z.array(z.object({ slot: n(2), receiptId: digest }).strict())
    .min(1).max(3).superRefine((parents, context) => {
      if (parents.some((parent, index) => index > 0 && parent.slot <= parents[index - 1]!.slot))
        context.addIssue({ code: 'custom', message: 'Parent slots must be unique and ascending.' });
    }) }).strict(),
  z.object({ kind: z.literal('saved-content'), documentsDigest: digest }).strict(),
]);
export type OutputProvenance = z.infer<typeof outputProvenanceSchema>;
export const outputClaimSchema = documentOperationSchema
  .extend({
    version: z.literal(1),
    expiresAt: n(),
    documentId: uuid,
    slots: z.array(n(2)).min(1).max(3),
    contentDigest: digest,
    provenance: outputProvenanceSchema,
    parserRevision: z.literal("t18-reviewed-v2"),
    processorRevision: z.enum([
      "local-text-v1",
      "local-docx-body-v1",
      "local-pdf-page-text-v1",
      "cloudflare-to-markdown-text-v1",
      "openrouter-file-parser-v1",
    ]),
  })
  .strict();
export const documentOutputSchema = documentContentSchema
  .safeExtend({
    receipt: z
      .object({ payload: outputClaimSchema, signature: digest })
      .strict(),
  })
  .strict().superRefine((value, context) => {
    if (value.receipt.payload.processorRevision !== documentProcessorRevision(value))
      context.addIssue({ code: 'custom', message: 'Invalid document processor.' });
  });
export type DocumentContent = z.infer<typeof documentContentSchema>;
export type DocumentOutput = z.infer<typeof documentOutputSchema>;
export const documentSelectionSchema = z
  .object({
    documentId: uuid,
    sectionId: z.string().regex(/^section-[1-9][0-9]{0,2}$/),
    start: n(),
    end: n(),
  })
  .strict();
export const documentContextSchema = documentOperationSchema
  .extend({
    outputs: z.array(documentOutputSchema).min(1).max(3),
    selections: z.array(documentSelectionSchema).min(1).max(24),
  })
  .strict();
export const documentDisclosures = Object.freeze({
  lifetime:
    "Unsaved documents remain in this browser session. Verified document receipts expire after 30 minutes.",
  conversion:
    "TXT, paste, DOCX body text and a limited image-free digital PDF subset are processed by this service without a remote conversion provider. PDF page association is checked; coverage, visual layout and reading order remain unverified. Unsupported PDFs need paste or TXT. Remote conversion and OCR remain unavailable.",
  operations:
    "Conversion attempts have daily operational limits. A failed or uncertain attempt remains counted. Counts do not estimate provider credits or neurons.",
  reading:
    "Only the selected document spans are included in this answer. Visitor text cannot establish Steve Oak’s accomplishments.",
});
