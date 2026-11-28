import { z } from "zod";
import { oakAuthorizationHeaders } from "./oakAccountClient";
import { reopenedSavedDocumentsSchema } from '../../packages/oak-agent-contracts/src/saved-documents';
import {
  documentLimits, documentOutputSchema, preflightReceiptSchema,
  type DocumentKind, type DocumentOutput, type DocumentOperation, type PreflightReceipt,
} from "../../packages/oak-agent-contracts/src/documents";

export type OakDocumentInput = Readonly<{ kind: DocumentKind; body: Blob; label: string }>;
export type OakDocumentJob = Readonly<{ conversationId: string; submissionId: string; generation: number }>;
export type OakDocumentPrepared = Readonly<{ operation: DocumentOperation; outputs: DocumentOutput[]; expiresAt: number }>;
const beginSchema = z.object({ submissionId: z.uuid(), generation: z.number().int().min(0),
  expiresAt: z.number().int().min(0), expectedSlots: z.number().int().min(1).max(3), disclosures: z.unknown() });
const preflightSchema = z.object({ receipt: preflightReceiptSchema, output: documentOutputSchema.optional() }).strict();
const extractionSchema = z.object({ output: documentOutputSchema }).strict();
const committedSchema = z.object({ state: z.literal("committed"), totalBytes: z.number().int(),
  totalPdfPages: z.number().int(), uniqueConversionAttempts: z.number().int(), expiresAt: z.number().int() });
const readySchema = z.object({ state: z.literal("ready"), totalBytes: z.number().int(), totalTokens: z.number().int(), expiresAt: z.number().int() });
const scanAllowanceSchema = z.object({ pagesLeft: z.number().int().min(0).max(20), sponsorAvailable: z.boolean() }).strict();
export type OakScanAllowance = z.infer<typeof scanAllowanceSchema>;
function checkedResponse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new OakDocumentError('document-invalid-response');
  return parsed.data;
}

export class OakDocumentError extends Error {
  constructor(readonly code: string) { super(code); }
}
/** A server-issued scan receipt is retained for deliberate OCR review, never a local preview. */
export class OakDocumentOcrRequired extends OakDocumentError {
  constructor(readonly receipt: PreflightReceipt, readonly input: OakDocumentInput, readonly job: OakDocumentJob) {
    super('document-ocr-required');
  }
}
/** Small public error codes only. Raw response/error details never reach the UI. */
async function readResponse(response: Response): Promise<unknown> {
  let value: unknown;
  try {
    if (!response.body) throw new Error("missing-body");
    const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0, text = "";
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 400_000) { await reader.cancel(); throw new Error("response-limit"); }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode(); value = JSON.parse(text);
    } finally { reader.releaseLock(); }
  } catch {
    // The edge rate limit answers 429 with a non-JSON page; that is "wait", not an unreadable file (P15 QA).
    throw new OakDocumentError(response.status === 429 ? "document-busy" : "document-invalid-response");
  }
  if (!response.ok) {
    if (response.status === 401) throw new OakDocumentError("sign-in-required");
    let code = "document-unavailable";
    try {
      if (value && typeof value === "object" && "error" in value && typeof value.error === "string" &&
          /^(document-|file-|format-|binary-|invalid-|empty-|normalized-|pdf-|docx-|unsupported-|purpose-|continuation-)[a-z-]{1,80}$/.test(value.error)) code = value.error;
    } catch { /* Unknown failures stay content-free. */ }
    throw new OakDocumentError(code);
  }
  return value;
}
function path(job: OakDocumentJob, suffix: string, kind?: DocumentKind) {
  const query = new URLSearchParams({ conversationId: job.conversationId, generation: String(job.generation) });
  if (kind) query.set("kind", kind);
  return `/api/oak/documents/${job.submissionId}/${suffix}?${query}`;
}
function assertLive(signal: AbortSignal) { if (signal.aborted) throw new DOMException("Stopped", "AbortError"); }
function operationOf(receipt: PreflightReceipt): DocumentOperation {
  const { principalHash, conversationId, submissionId, generation } = receipt.payload;
  return { principalHash, conversationId, submissionId, generation };
}
function sameOperation(a: DocumentOperation | OakDocumentJob, b: DocumentOperation | OakDocumentJob) {
  return a.conversationId === b.conversationId && a.submissionId === b.submissionId && a.generation === b.generation;
}
/** DOCX/PDF client dispatch is local-only. Missing previews never authorize remote extraction. */
function assertLocalMappedOutput(output: DocumentOutput | undefined, receipt: PreflightReceipt) {
  const pdf = receipt.payload.kind === 'pdf';
  if (!output || output.kind !== receipt.payload.kind || output.sourceMapping !== (pdf ? 'pdf-page-order-v1' : 'docx-body-order-v1') ||
      output.receipt.payload.processorRevision !== (pdf ? 'local-pdf-page-text-v1' : 'local-docx-body-v1') || output.extractionCompleteness !== 'unknown')
    throw new OakDocumentError(pdf ? 'document-local-pdf-unavailable' : 'document-local-docx-unavailable');
  const payload = output.receipt.payload, slot = receipt.payload.slot, provenance = payload.provenance;
  if (!sameOperation(payload, receipt.payload) || payload.principalHash !== receipt.payload.principalHash ||
      payload.expiresAt !== receipt.payload.expiresAt || payload.expiresAt <= Date.now() || payload.documentId !== output.documentId ||
      output.slots.length !== 1 || output.slots[0] !== slot || payload.slots.length !== 1 || payload.slots[0] !== slot ||
      provenance.kind !== 'preflight' || provenance.parents.length !== 1 || provenance.parents[0]!.slot !== slot ||
      provenance.parents[0]!.receiptId !== receipt.signature ||
      (pdf && (receipt.payload.localPdfRevision !== 'local-pdf-page-text-v1' || receipt.payload.mediaEligibility.status !== 'image-free' ||
        receipt.payload.pdfPages !== output.pdfPages || output.pageMapping !== 'verified-pages')) ||
      output.sections.some((section, index) => (pdf ? !section.sourcePage : !section.originalSource) || section.sourceStart !== section.start ||
        section.sourceEnd !== section.end || section.start !== (output.sections[index - 1]?.end ?? 0) ||
        section.end <= section.start || section.end > output.text.length) || output.sections.at(-1)!.end !== output.text.length)
    throw new OakDocumentError('document-invalid-response');
}
/** Duplicate slots must carry the same exact signed output, never a second caller-selected value. */
export function deduplicateOakDocumentOutputs(outputs: readonly DocumentOutput[], expectedSlots: number) {
  const documents = new Map<string, DocumentOutput>(), slots = new Map<number, string>();
  for (const raw of outputs) {
    const output = documentOutputSchema.parse(raw), previous = documents.get(output.documentId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(output)) throw new OakDocumentError("document-invalid-response");
    if (output.receipt.payload.documentId !== output.documentId ||
        JSON.stringify(output.slots) !== JSON.stringify(output.receipt.payload.slots)) throw new OakDocumentError("document-invalid-response");
    const provenance = output.receipt.payload.provenance;
    if (provenance.kind === 'preflight' && JSON.stringify(provenance.parents.map(parent => parent.slot)) !==
        JSON.stringify([...output.slots].sort((a, b) => a - b))) throw new OakDocumentError('document-invalid-response');
    let end = 0;
    if (new TextEncoder().encode(output.text).byteLength !== output.normalizedBytes || new Set(output.slots).size !== output.slots.length)
      throw new OakDocumentError("document-invalid-response");
    for (const section of output.sections) {
      if (section.start !== end || section.end <= section.start || section.end > output.text.length) throw new OakDocumentError("document-invalid-response");
      end = section.end;
    }
    if (end !== output.text.length) throw new OakDocumentError("document-invalid-response");
    for (const slot of output.slots) {
      if (slot >= expectedSlots || (slots.has(slot) && slots.get(slot) !== output.documentId)) throw new OakDocumentError("document-invalid-response");
      slots.set(slot, output.documentId);
    }
    documents.set(output.documentId, output);
  }
  if (slots.size !== expectedSlots || documents.size > documentLimits.files) throw new OakDocumentError("document-invalid-response");
  return [...documents.values()].sort((a, b) => Math.min(...a.slots) - Math.min(...b.slots));
}

/** This client owns transport ordering only. Files are held by its caller in browser memory. */
export function createOakDocumentsClient(transport: typeof fetch = (...args) => fetch(...args), authorization = oakAuthorizationHeaders) {
  const send = async (url: string, init: RequestInit) => {
    const headers = await authorization();
    if (init.signal) assertLive(init.signal);
    return transport(url, { ...init, redirect: "error", headers: { ...headers, ...(init.headers as Record<string, string>) } });
  };
  const control = (url: string, body: unknown, signal?: AbortSignal) => send(url, { method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), ...(signal ? { signal } : {}) }).then(readResponse);
  const cancel = async (job: OakDocumentJob) => {
    const value = await control(path(job, "cancel"), {});
    if (!value || typeof value !== "object" || !("state" in value) || value.state !== "cancelled") throw new OakDocumentError("document-unavailable");
  };
  return {
    cancel,
    /** Pages this visitor can still scan today, and whether Oak's scan budget has room. */
    async scanAllowance(job: OakDocumentJob, signal: AbortSignal): Promise<OakScanAllowance> {
      return checkedResponse(scanAllowanceSchema, await readResponse(await send(path(job, 'scan'), {
        method: 'GET', credentials: 'same-origin', cache: 'no-store', signal })));
    },
    /** Gemini reads the staged image-only PDF (Oak's key, or the visitor's when a session is given), then it finishes like any upload. */
    async scan(source: OakDocumentOcrRequired, signal: AbortSignal, fundingSession?: unknown): Promise<OakDocumentPrepared> {
      const { receipt, input, job } = source;
      assertLive(signal);
      const output = documentOutputSchema.parse(await readResponse(await send(path(job, 'scan'), {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', body: input.body, signal,
        headers: { 'Content-Type': 'application/octet-stream', ...(fundingSession ? { 'x-oak-funding-session': JSON.stringify(fundingSession) } : {}) },
      })));
      const payload = output.receipt.payload, parents = payload.provenance.kind === 'preflight' ? payload.provenance.parents : [];
      if (!sameOperation(job, payload) || payload.principalHash !== receipt.payload.principalHash || output.ocrSource?.engine !== 'native' ||
          parents.length !== 1 || parents[0]!.receiptId !== receipt.signature) throw new OakDocumentError('document-invalid-response');
      assertLive(signal);
      committedSchema.parse(await control(path(job, 'commit'), { receipts: [receipt] }, signal));
      const ready = readySchema.parse(await control(path(job, 'finalize'), { outputs: [output] }, signal));
      return { operation: operationOf(receipt), outputs: [output], expiresAt: ready.expiresAt };
    },
    async reissue(prepared: OakDocumentPrepared, selections: readonly unknown[], signal: AbortSignal) {
      assertLive(signal);
      const fresh = reopenedSavedDocumentsSchema.parse(await control(path(prepared.operation, 'reissue'),
        { outputs: prepared.outputs, selections }, signal));
      assertLive(signal);
      if (fresh.operation.conversationId !== prepared.operation.conversationId || fresh.operation.submissionId === prepared.operation.submissionId ||
          fresh.operation.principalHash === prepared.operation.principalHash || fresh.outputs.some(output =>
            !sameOperation(fresh.operation, output.receipt.payload) || output.receipt.payload.principalHash !== fresh.operation.principalHash ||
            output.receipt.payload.expiresAt !== prepared.expiresAt)) throw new OakDocumentError('document-invalid-response');
      const expectedSlots = new Set(prepared.outputs.flatMap(output => output.slots)).size;
      deduplicateOakDocumentOutputs(fresh.outputs, expectedSlots);
      const plain = (outputs: DocumentOutput[]) => outputs.map(({ receipt: _receipt, ...content }) => content);
      if (JSON.stringify(plain(fresh.outputs)) !== JSON.stringify(plain(prepared.outputs)) ||
          JSON.stringify(fresh.outputs.map(output => output.receipt.payload.provenance)) !==
            JSON.stringify(prepared.outputs.map(output => output.receipt.payload.provenance)) ||
          JSON.stringify(fresh.selections) !== JSON.stringify(selections)) throw new OakDocumentError('document-invalid-response');
      return fresh;
    },
    async prepare(inputs: readonly OakDocumentInput[], conversationId: string, signal: AbortSignal,
      callbacks: { job: (job: OakDocumentJob) => void; progress: (text: string) => void }): Promise<OakDocumentPrepared> {
      if (!inputs.length || inputs.length > documentLimits.files || inputs.some(input => !input.body.size || input.body.size > documentLimits.fileBytes) ||
          inputs.reduce((sum, input) => sum + input.body.size, 0) > documentLimits.submissionBytes) throw new OakDocumentError("document-input-limit");
      assertLive(signal);
      callbacks.progress("Preparing documents");
      const begin = beginSchema.parse(await control("/api/oak/documents/begin", { conversationId, expectedSlots: inputs.length }, signal));
      const job = { conversationId, submissionId: begin.submissionId, generation: begin.generation };
      callbacks.job(job);
      assertLive(signal);
      if (begin.expectedSlots !== inputs.length) throw new OakDocumentError("document-invalid-response");
      const receipts: PreflightReceipt[] = [], outputs: DocumentOutput[] = [];
      let operation: DocumentOperation | null = null;
      for (const [slot, input] of inputs.entries()) {
        assertLive(signal); callbacks.progress(`Checking document ${slot + 1} of ${inputs.length}`);
        const value = checkedResponse(preflightSchema, await readResponse(await send(path(job, `slots/${slot}`, input.kind), {
          method: "PUT", credentials: "same-origin", cache: "no-store", body: input.body, signal, headers: { "Content-Type": "application/octet-stream" },
        })));
        assertLive(signal);
        const receipt = value.receipt, current = operationOf(receipt);
        if (!sameOperation(job, current) || receipt.payload.slot !== slot || receipt.payload.kind !== input.kind ||
            receipt.payload.expectedSlots !== inputs.length || (operation && operation.principalHash !== current.principalHash)) throw new OakDocumentError("document-invalid-response");
        if (input.kind === 'pdf' && inputs.length === 1 && !value.output && receipt.payload.slot === 0 &&
            receipt.payload.expectedSlots === 1 && receipt.payload.pdfPages > 0 && receipt.payload.expiresAt > Date.now() &&
            receipt.payload.originalBytes === input.body.size && receipt.payload.mediaEligibility.status === 'image-present')
          throw new OakDocumentOcrRequired(receipt, input, job);
        // Gemini reads one PDF of page images at a time; in a batch, say so instead of "OCR unavailable" (P15 QA).
        if (input.kind === 'pdf' && inputs.length > 1 && !value.output && receipt.payload.mediaEligibility.status === 'image-present')
          throw new OakDocumentError('document-scan-batch');
        if (input.kind === 'docx' || input.kind === 'pdf') assertLocalMappedOutput(value.output, receipt);
        operation = current; receipts.push(receipt);
        if (value.output) outputs.push(value.output);
      }
      assertLive(signal); callbacks.progress("Checking the complete document set");
      committedSchema.parse(await control(path(job, "commit"), { receipts }, signal));
      for (const [slot, input] of inputs.entries()) {
        if (outputs.some(output => output.slots.includes(slot))) continue;
        assertLive(signal); callbacks.progress(`Extracting document ${slot + 1} of ${inputs.length}`);
        const extracted = extractionSchema.parse(await readResponse(await send(path(job, `extract/${slot}`, input.kind), {
          method: "POST", credentials: "same-origin", cache: "no-store", body: input.body, signal, headers: { "Content-Type": "application/octet-stream" },
        })));
        outputs.push(extracted.output);
      }
      assertLive(signal);
      const unique = deduplicateOakDocumentOutputs(outputs, inputs.length);
      if (!operation || unique.some(output => {
        const payload = output.receipt.payload;
        const parents = [...output.slots].sort((a, b) => a - b).map(slot => ({ slot, receiptId: receipts[slot]!.signature }));
        return !sameOperation(operation!, payload) || operation!.principalHash !== payload.principalHash ||
          payload.provenance.kind !== 'preflight' || JSON.stringify(payload.provenance.parents) !== JSON.stringify(parents);
      }))
        throw new OakDocumentError("document-invalid-response");
      callbacks.progress("Finishing the preview");
      const ready = readySchema.parse(await control(path(job, "finalize"), { outputs: unique }, signal));
      assertLive(signal);
      return { operation, outputs: unique, expiresAt: ready.expiresAt };
    },
  };
}
