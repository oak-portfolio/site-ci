import { oakAuthorizationHeaders } from './oakAccountClient';
import { preflightReceiptSchema, type PreflightReceipt } from '../../packages/oak-agent-contracts/src/documents';
import { ocrConfirmRequestSchema, ocrConfirmResponseSchema, ocrControlRequestSchema, ocrQuoteRequestSchema, ocrQuoteSchema, ocrStatusSchema,
  type OcrQuote } from '../../packages/oak-agent-contracts/src/ocr';
import { visitorFundingSessionSchema, type VisitorFundingSession } from '../../packages/oak-agent-contracts/src/funding';
import { z } from 'zod';

export class OakOcrError extends Error { constructor(readonly code: string) { super(code); } }
/** Exact decimal currency input, never floating-point rounding of the visitor's chosen bound. */
export function oakOcrCapFromUsd(value: string): number | null {
  if (!/^(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,6})?$/.test(value)) return null;
  const [whole, fractional = ''] = value.split('.');
  const amount = Number(whole) * 1_000_000 + Number(fractional.padEnd(6, '0'));
  return amount <= 1_000_000 ? amount : null;
}
const live = (signal: AbortSignal) => { if (signal.aborted) throw new OakOcrError('ocr-cancelled'); };
export function assertOakOcrSource(receipt: PreflightReceipt, now = Date.now()) {
  const parsed = preflightReceiptSchema.safeParse(receipt);
  if (!parsed.success) throw new OakOcrError('ocr-source');
  const p = parsed.data.payload;
  if (p.kind !== 'pdf' || p.expectedSlots !== 1 || p.slot !== 0 || p.pdfPages < 1 ||
      p.mediaEligibility.status !== 'image-present' || p.expiresAt <= now) throw new OakOcrError('ocr-source');
}
export function assertOakOcrQuote(quote: OcrQuote, receipt: PreflightReceipt, cap: number, now = Date.now()) {
  assertOakOcrSource(receipt, now);
  const p = receipt.payload, s = quote.source;
  if (quote.expiresAt <= now || quote.expiresAt > Math.min(p.expiresAt, now + 30_000) ||
      quote.totalBoundMicroUsd > cap || quote.scope.pages !== p.pdfPages || quote.scope.originalBytes !== p.originalBytes ||
      s.principalHash !== p.principalHash || s.conversationId !== p.conversationId || s.submissionId !== p.submissionId ||
      s.generation !== p.generation || s.originalSha256 !== p.originalSha256 || s.receiptId !== receipt.signature)
    throw new OakOcrError('ocr-stale-authority');
}
export function oakOcrFailure(error: unknown) {
  const code = error instanceof OakOcrError ? error.code : 'ocr-unavailable';
  if (code === 'ocr-cancelled') return 'OCR review stopped. Your draft and selected files are still here.';
  if (code === 'ocr-disclosure-required') return 'OCR cannot be confirmed because the service has not supplied complete processor and processing terms. Paste the text or use TXT.';
  if (code === 'ocr-source') return 'This file has no current scanned-PDF reading permission. Prepare one PDF explicitly, or paste the text or use TXT.';
  if (code === 'ocr-stale-authority' || code === 'ocr-expired' || code === 'ocr-stale-policy') return 'This OCR quote is no longer valid. Request a new quote explicitly before confirming.';
  if (code === 'ocr-funding-required') return 'Select your own connected funding for this browser tab before requesting paid OCR. Connecting does not start OCR.';
  if (code === 'ocr-result-unverified' || code === 'ocr-consumed' || code === 'ocr-timeout') return 'No verified extraction is available. The operation may have reserved funds or incurred charges. Check its status explicitly before doing anything else.';
  if (/cap|exhausted/.test(code)) return 'OCR exceeds the current funding or processing bound. Paste the text or use TXT.';
  return 'OCR is unavailable until account, processing terms, limits and extraction checks pass. Paste the text or use TXT.';
}
/** Fixed same-origin endpoints, bounded no-store responses and content-free failures. Never retries. */
export function createOakOcrClient(transport: typeof fetch = (...args) => fetch(...args), authorization = oakAuthorizationHeaders,
  now = () => Date.now(), timeoutMs = 30_000) {
  async function request<T>(action: 'quote' | 'confirm' | 'status' | 'cancel', body: unknown, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
    live(signal);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopped = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(new OakOcrError(signal.aborted ? 'ocr-cancelled' : 'ocr-timeout')), { once: true });
      timer = setTimeout(abort, timeoutMs);
    });
    try {
      const work = (async () => {
        const headers = await authorization(); live(controller.signal);
        const pending = transport(`/api/oak/ocr/${action}`, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
          redirect: 'error', signal: controller.signal, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        void pending.then(response => { if (controller.signal.aborted) void response.body?.cancel().catch(() => {}); }, () => {});
        const response = await pending;
        live(controller.signal);
        if (!response.body) throw new OakOcrError('ocr-invalid-response');
        const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
        const cancelReader = () => { void reader.cancel().catch(() => {}); };
        controller.signal.addEventListener('abort', cancelReader, { once: true });
        let bytes = 0, text = '';
        try {
          while (true) {
            const part = await reader.read(); live(controller.signal);
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > (action === 'confirm' ? 400_000 : 16_000)) { await reader.cancel(); throw new OakOcrError('ocr-invalid-response'); }
            text += decoder.decode(part.value, { stream: true });
          }
          const value: unknown = JSON.parse(text + decoder.decode());
          if (!response.ok) {
            const error = z.strictObject({ error: z.string().regex(/^ocr-[a-z-]{1,64}$/) }).safeParse(value);
            throw new OakOcrError(error.success ? error.data.error : 'ocr-unavailable');
          }
          const parsed = schema.safeParse(value);
          if (!parsed.success) throw new OakOcrError(action === 'quote' ? 'ocr-disclosure-required' : 'ocr-result-unverified');
          return parsed.data;
        } finally { controller.signal.removeEventListener('abort', cancelReader); reader.releaseLock(); }
      })();
      return await Promise.race([work, stopped]);
    } catch (error) { throw error instanceof OakOcrError ? error : new OakOcrError('ocr-unavailable'); }
    finally { clearTimeout(timer); signal.removeEventListener('abort', abort); controller.abort(); }
  }
  return {
    async quote(receipt: PreflightReceipt, funding: VisitorFundingSession, cap: number, signal: AbortSignal) {
      assertOakOcrSource(receipt, now());
      const input = ocrQuoteRequestSchema.safeParse({ receipt, funding, visitorCapMicroUsd: cap });
      if (!input.success) throw new OakOcrError('ocr-source');
      const quote = await request('quote', input.data, ocrQuoteSchema, signal);
      live(signal); assertOakOcrQuote(quote, receipt, cap, now()); return quote;
    },
    async confirm(quote: OcrQuote, receipt: PreflightReceipt, original: Blob, funding: VisitorFundingSession,
      consent: { scopeAndTerms: boolean; visitorCharges: boolean }, signal: AbortSignal) {
      live(signal);
      if (!consent.scopeAndTerms || !consent.visitorCharges) throw new OakOcrError('ocr-confirmation-required');
      const parsedQuote = ocrQuoteSchema.safeParse(quote);
      if (!parsedQuote.success) throw new OakOcrError('ocr-disclosure-required');
      assertOakOcrQuote(parsedQuote.data, receipt, quote.totalBoundMicroUsd, now());
      if (original.size !== receipt.payload.originalBytes) throw new OakOcrError('ocr-source');
      const bytes = new Uint8Array(await original.arrayBuffer()); live(signal);
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
      live(signal);
      if (digest !== receipt.payload.originalSha256) throw new OakOcrError('ocr-source');
      let binary = '';
      for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
      assertOakOcrQuote(parsedQuote.data, receipt, quote.totalBoundMicroUsd, now());
      const { policyRevision, termsRevision, parserBoundMicroUsd, modelBoundMicroUsd, totalBoundMicroUsd } = quote;
      const input = ocrConfirmRequestSchema.safeParse({ quoteId: quote.quoteId, receipt, funding, originalBase64: btoa(binary),
        confirmation: { policyRevision, termsRevision, parserBoundMicroUsd, modelBoundMicroUsd, totalBoundMicroUsd } });
      if (!input.success) throw new OakOcrError('ocr-source');
      const result = await request('confirm', input.data, ocrConfirmResponseSchema, signal);
      if (result.quoteId !== quote.quoteId) throw new OakOcrError('ocr-result-unverified');
      if ('output' in result) {
        const p = receipt.payload, output = result.output, claim = output.receipt.payload, source = output.ocrSource;
        if (!source || source.originalSha256 !== p.originalSha256 || source.receiptId !== receipt.signature ||
            claim.principalHash !== p.principalHash || claim.conversationId !== p.conversationId ||
            claim.submissionId !== p.submissionId || claim.generation !== p.generation || claim.expiresAt !== p.expiresAt ||
            claim.expiresAt <= now() || claim.documentId !== output.documentId || output.pdfPages !== p.pdfPages ||
            output.slots.length !== 1 || output.slots[0] !== p.slot || claim.slots.length !== 1 || claim.slots[0] !== p.slot ||
            claim.provenance.kind !== 'preflight' || claim.provenance.parents.length !== 1 ||
            claim.provenance.parents[0]!.slot !== p.slot || claim.provenance.parents[0]!.receiptId !== receipt.signature)
          throw new OakOcrError('ocr-result-unverified');
      }
      return result;
    },
    async status(quoteId: string, signal: AbortSignal, funding?: VisitorFundingSession) {
      const input = ocrControlRequestSchema.safeParse({ quoteId, ...(funding ? { funding } : {}) });
      if (!input.success) throw new OakOcrError('ocr-source');
      const result = await request('status', input.data, ocrStatusSchema, signal);
      if (result.quoteId !== quoteId) throw new OakOcrError('ocr-result-unverified'); return result;
    },
    async cancel(quoteId: string, funding: VisitorFundingSession, signal: AbortSignal) {
      if (!z.uuid().safeParse(quoteId).success) throw new OakOcrError('ocr-source');
      const session = visitorFundingSessionSchema.safeParse(funding);
      if (!session.success) throw new OakOcrError('ocr-funding-required');
      const result = await request('cancel', { quoteId, funding: session.data }, ocrStatusSchema, signal);
      if (result.quoteId !== quoteId) throw new OakOcrError('ocr-result-unverified'); return result;
    },
  };
}
