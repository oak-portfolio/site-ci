import { useSyncExternalStore } from "react";
import { documentContentSchema, documentLimits, documentSelectionSchema,
  type DocumentContent, type DocumentOutput, type DocumentOperation } from "../../packages/oak-agent-contracts/src/documents";
import { reopenedSavedDocumentsSchema, durableSavedDocuments, type ReopenedSavedDocuments, type SavedDocument } from '../../packages/oak-agent-contracts/src/saved-documents';
import { createOakDocumentsClient, OakDocumentError, OakDocumentOcrRequired, type OakDocumentInput, type OakDocumentJob, type OakDocumentPrepared, type OakScanAllowance } from "./oakDocumentsClient";
import { createOakOcrClient, OakOcrError, oakOcrFailure } from './oakOcrClient';
import { oakFundingMemory } from './oakFundingSession';
import type { OcrQuote, OcrStatus } from '../../packages/oak-agent-contracts/src/ocr';
import type { VisitorFundingSession } from '../../packages/oak-agent-contracts/src/funding';

import { isOakViewportSupported, oakViewportNotice } from "./oakViewportSupport";

export type OakDocumentSelection = ReturnType<typeof documentSelectionSchema.parse>;
/** Compare a role reads at most this many document sections (the contract's requirementSource bound), while a
 * document question may read many more. Q16-D6: the limit is said where the visitor selects, not after Compare opens. */
export const OAK_COMPARE_SECTION_LIMIT = 3;
export function oakCompareSectionNote(count: number): string | null {
  if (count <= OAK_COMPARE_SECTION_LIMIT) return null;
  const extra = count - OAK_COMPARE_SECTION_LIMIT;
  return `Compare a role reads up to ${OAK_COMPARE_SECTION_LIMIT} sections. Unselect ${extra} to compare.`;
}

/** Q06: selected text that reads like a job post (requirements, responsibilities, qualifications) can go straight to Compare a role. */
export function oakReadsAsRole(text: string) {
  const hits = [/\b(?:requirements?|qualifications?|must[- ]haves?|nice[- ]to[- ]haves?)\b/i, /\b(?:responsibilities|what you(?:'|\u2019)ll do|you will)\b/i,
    /\b(?:years? of experience|\d\+? years?)\b/i, /\b(?:role|position|job|we(?:'|\u2019)re hiring|about the team)\b/i,
    /\b(?:senior|staff|principal|lead|head of)\b[^.\n]{0,40}\b(?:engineer|designer|developer|manager|scientist|researcher)\b/i].filter(pattern => pattern.test(text)).length;
  return hits >= 2;
}
/** The visitor's selected spans as one string, in selection order. */
export function oakSelectedText(documents: readonly DocumentContent[], selections: readonly OakDocumentSelection[]) {
  return selections.map(item => documents.find(document => document.documentId === item.documentId)?.text.slice(item.start, item.end) ?? "").join("\n");
}
/** Q18 F3: a question that asks how well Steve fits or matches, as opposed to what the document says. */
export function oakAsksFit(text: string) {
  return /\b(?:fit|fits|match|matches|suit|suits|suited|suitable|qualified|good candidate|right candidate)\b/i.test(text);
}
export type OakDocumentsOwner = Readonly<{ conversationId: string; accountEpoch: number }>;
export type OakDocumentTurnContext = Readonly<{ operation: DocumentOperation; outputs: DocumentOutput[]; selections: OakDocumentSelection[] }>;
export type OakSavedDocument = SavedDocument;
export type OakDocumentsSavedValue = Readonly<{ documents: OakSavedDocument[]; selections: OakDocumentSelection[] }>;
export type OakDocumentsSnapshot = Readonly<{
  open: boolean; pending: boolean; phase: string; error: string | null; paste: string;
  documents: readonly DocumentContent[]; selections: readonly OakDocumentSelection[];
  usedSelections: readonly OakDocumentSelection[]; selectedBytes: number; expiresAt: number | null; restored: boolean;
  continuationAvailable: boolean;
  stagedFiles: readonly string[]; stagedSizes: readonly number[]; ocrSource: { label: string; pages: number; bytes: number; expiresAt: number } | null;
  /** Names of staged files whose own preparation just failed; a failed paste or sample marks none of them. */
  failedFiles: readonly string[];
  ocrQuote: OcrQuote | null; ocrScopeConsent: boolean; ocrChargeConsent: boolean; ocrAttempted: boolean;
  ocrStatus: OcrStatus | null; ocrInference: 'completed' | 'failed' | null;
  scanAllowance: OakScanAllowance | null;
  /** v3 review: each prepared document's own file name ("role-description.docx", "Pasted text"), by document id. */
  names: Readonly<Record<string, string>>;
}>;
const empty: OakDocumentsSnapshot = Object.freeze({ open: false, pending: false, phase: "", error: null, paste: "",
  documents: [], selections: [], usedSelections: [], selectedBytes: 0, expiresAt: null, restored: false, continuationAvailable: false,
  stagedFiles: [], stagedSizes: [], failedFiles: [], ocrSource: null, ocrQuote: null, ocrScopeConsent: false, ocrChargeConsent: false, ocrAttempted: false,
  ocrStatus: null, ocrInference: null, scanAllowance: null, names: {} });
const boundary = (text: string, index: number) => !(index > 0 && index < text.length &&
  /[\uD800-\uDBFF]/.test(text[index - 1]!) && /[\uDC00-\uDFFF]/.test(text[index]!));

/** The file name each prepared document came from: its first slot is the position of its input in the request. */
function oakDocumentNames(outputs: readonly Pick<DocumentContent, "documentId" | "slots">[], inputs: readonly Pick<OakDocumentInput, "label">[]) {
  return Object.fromEntries(outputs.flatMap(output => {
    const label = inputs[Math.min(...output.slots)]?.label ?? inputs[0]?.label;
    return label ? [[output.documentId, label]] : [];
  }));
}

/**
 * v3 review: what a visitor calls a document and a part of it. The file name, else "Your document"; a part is its page, or
 * its opening words, never a block number.
 */
export function oakDocumentName(snapshot: Pick<OakDocumentsSnapshot, "names">, documentId: string) {
  return snapshot.names[documentId] ?? "Your document";
}
export function oakSectionName(text: string, page?: number) {
  if (page !== undefined) return `Page ${page}`;
  const words = text.replace(/^[\s\-*•]+/, "").split(/\s+/).filter(Boolean);
  return words.length <= 5 ? words.join(" ") : `${words.slice(0, 5).join(" ").replace(/[,.;:]$/, "")}\u2026`;
}

/** Same complete excerpt envelope as server selectedContext. Reject, never shorten. */
export function oakDocumentReadSet(documents: readonly DocumentContent[], selections: readonly OakDocumentSelection[]) {
  if (!selections.length || selections.length > documentLimits.selections) throw new OakDocumentError("document-invalid-selection");
  const used = new Map<string, OakDocumentSelection[]>();
  const excerpts = selections.map(raw => {
    const selection = documentSelectionSchema.parse(raw), output = documents.find(item => item.documentId === selection.documentId);
    const section = output?.sections.find(item => item.id === selection.sectionId);
    if (!output || !section || selection.start < section.start || selection.end > section.end || selection.end <= selection.start ||
        !boundary(output.text, selection.start) || !boundary(output.text, selection.end)) throw new OakDocumentError("document-invalid-selection");
    const previous = used.get(output.documentId) ?? [];
    if (previous.some(item => selection.start < item.end && selection.end > item.start)) throw new OakDocumentError("document-duplicate-selection");
    used.set(output.documentId, [...previous, selection]);
    return { sourceId: `visitor-document:${output.documentId}:${section.id}:${selection.start}-${selection.end}`,
      label: `Document ${Math.min(...output.slots) + 1}`,
      ...(section.originalSource ? {originalSource:section.originalSource} : {}), sectionId: section.id, start: selection.start, end: selection.end,
      ...(section.sourcePage !== undefined ? { sourcePage: section.sourcePage } : {}),
      text: output.text.slice(selection.start, selection.end), warnings: output.warnings, extractionCompleteness: output.extractionCompleteness };
  });
  const includedUtf16 = selections.reduce((sum, item) => sum + item.end - item.start, 0),
    availableUtf16 = documents.reduce((sum, item) => sum + item.text.length, 0);
  const envelope = { authority: "visitor-text-only", offsetUnit: "utf16", excerpts, includedUtf16, availableUtf16,
    omittedUtf16: availableUtf16 - includedUtf16, coverage: "selected-spans-only" };
  const bytes = new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
  if (bytes > documentLimits.contextBytes) throw new OakDocumentError("document-selection-too-large");
  return { bytes, envelope };
}
export function oakDocumentFailure(error: unknown) {
  const code = error instanceof OakDocumentError ? error.code : "document-unavailable";
  if (code === "sign-in-required") return "Sign in to prepare private documents. Your text is still here.";
  // Q11-G3: limits stay enforced in bytes; the visitor reads them in characters, files and pages.
  if (code === "document-selection-too-large") return "Choose less text. One answer reads about a page of selected text, labels included. Your full preview is still here.";
  if (code === "document-invalid-selection" || code === "document-duplicate-selection") return "Choose a genuine section or a shorter range within one section.";
  if (code === "document-remote-disabled") return "Remote document extraction is unavailable. Paste the text or choose a TXT file.";
  if (code === "document-local-docx-unavailable") return "This DOCX could not be prepared locally. Paste the text or choose a TXT file.";
  if (code === "document-scan-batch") return "One PDF is page images. Oak reads those one PDF at a time, so prepare it on its own.";
  if (code === "document-busy") return "Too many requests at once. Wait a few seconds, then try again. Your files are still here.";
  if (code === "document-local-pdf-unavailable" || code.startsWith('unsupported-pdf-')) return "This PDF is outside the supported image-free text subset. Paste the text or choose a TXT file. Remote conversion and OCR are unavailable.";
  if (code === "document-input-limit") return "Choose up to 3 files at a time. One file was too large or empty, so try a shorter version or paste its text.";
  if (code === "document-expired") return "This preview’s reading permission expired. Add the documents again to use them in an answer.";
  if (code === "purpose-required" || code === "continuation-required") return "Continue with your account before preparing documents. Your text is still here.";
  if (/limit|budget|pages/.test(code)) return "The document exceeds a reading or processing limit. Paste a smaller relevant section or use a smaller TXT file.";
  if (/format|binary|unicode|corrupt|encrypted|invalid/.test(code)) return "This document could not be read safely. Use a UTF-8 TXT file or paste the relevant text.";
  return "Document preparation could not finish. Your existing preview is still here. Retry explicitly or paste the text.";
}
/** No browser storage, back-import of the workspace, original archive or model submission. */
type OcrFunding = { session: VisitorFundingSession; revision: number; expiresAt: number };
const sameOcrFundingAuthority = (left: OcrFunding, right: OcrFunding) => left.revision === right.revision &&
  left.session.tabId === right.session.tabId && left.session.handle === right.session.handle;
const currentOcrFunding = (): OcrFunding => {
  let submission: ReturnType<typeof oakFundingMemory.submission>;
  try { submission = oakFundingMemory.submission(); } catch { throw new OakOcrError('ocr-funding-required'); }
  const status = oakFundingMemory.getSnapshot().status;
  if (submission.funding !== 'visitor' || !submission.visitorSession || !status?.expiresAt) throw new OakOcrError('ocr-funding-required');
  return { session: submission.visitorSession, revision: oakFundingMemory.revision(), expiresAt: status.expiresAt };
};
export function createOakDocumentsWorkspace(client = createOakDocumentsClient(), now = () => Date.now(),
  ocr = createOakOcrClient(), funding = currentOcrFunding) {
  let state = empty, owner: OakDocumentsOwner | null = null, prepared: OakDocumentPrepared | null = null, version = 0;
  let restoredDocuments: OakSavedDocument[] = [];
  let continuation: { prepared: OakDocumentPrepared; selections: OakDocumentSelection[]; owner: OakDocumentsOwner } | null = null;
  let stagedFiles: readonly File[] = [];
  const stageFiles = (files: readonly File[], nextOwner: OakDocumentsOwner) => {
    own(nextOwner); cancel('selection-change'); stagedFiles = [...files];
    update({ stagedFiles: files.map(file => file.name), stagedSizes: files.map(file => file.size), failedFiles: [],
      phase: files.length ? 'Files selected. Choose Prepare selected files to upload and inspect them.' : '', error: null });
  };
  let ocrSource: OakDocumentOcrRequired | null = null, quoteFunding: OcrFunding | null = null;
  // Revoke ready OCR authority without keeping its original Blob or funding handle.
  let completedOcrJob: OakDocumentJob | null = null;
  let ocrRun: AbortController | null = null;
  let ocrSourceExpiry: ReturnType<typeof setTimeout> | undefined;
  let ocrQuoteExpiry: ReturnType<typeof setTimeout> | undefined;
  let active: { controller: AbortController; job: OakDocumentJob | null; version: number; inputs: readonly OakDocumentInput[] } | null = null;
  const listeners = new Set<() => void>();
  const update = (next: Partial<OakDocumentsSnapshot>) => { state = { ...state, ...next }; for (const listener of listeners) listener(); };
  const cancelJob = (job: OakDocumentJob) => void client.cancel(job).catch(() => {
    // Content-free cancellation failure never revives a cancelled operation or its text.
  });
  const invalidateOcr = (cancelSource = true) => {
    ocrRun?.abort(); ocrRun = null; clearTimeout(ocrQuoteExpiry);
    const quote = state.ocrQuote, connected = quoteFunding;
    if (quote && connected) void ocr.cancel(quote.quoteId, connected.session, new AbortController().signal).catch(() => {});
    if (cancelSource) { clearTimeout(ocrSourceExpiry); if (ocrSource) cancelJob(ocrSource.job); ocrSource = null; }
    quoteFunding = null;
    // An attempted source never regains dispatch permission through lease/key changes.
    // Its owned status handle survives until the source/owner is explicitly discarded.
    const retainAttempt = !cancelSource && state.ocrAttempted;
    update({ ocrQuote: retainAttempt ? state.ocrQuote : null, ocrScopeConsent: false, ocrChargeConsent: false, ocrAttempted: retainAttempt,
      ...(cancelSource ? { ocrSource: null, ocrStatus: null, ocrInference: null, scanAllowance: null } : {}) });
  };
  const cancel = (reason = "stop") => {
    version++;
    const run = active; active = null;
    run?.controller.abort();
    if (run?.job) cancelJob(run.job);
    if (completedOcrJob && !['panel-close', 'guest-account-continuation', 'account-document-reissue'].includes(reason)) {
      cancelJob(completedOcrJob); completedOcrJob = null; prepared = null; restoredDocuments = [];
      update({ documents: [], selections: [], usedSelections: [], selectedBytes: 0, expiresAt: null, restored: false,
        phase: state.ocrStatus?.actualCharge === 'verified' ?
          'OCR preview removed. Provider-reported charges remain reconciled.' : 'OCR preview removed. Its parser and model charges remain unknown.' });
    }
    invalidateOcr();
    if (state.pending) update({ pending: false, phase: "Stopped. Choose files or prepare pasted text to try again.", error: null });
  };
  const disposeOwned = (reason = "owner-change") => { cancel(reason); owner = null; prepared = null; continuation = null; restoredDocuments = []; stagedFiles = []; update(empty); };
  const own = (next: OakDocumentsOwner) => {
    if (owner && (owner.conversationId !== next.conversationId || owner.accountEpoch !== next.accountEpoch)) disposeOwned();
    owner = next;
  };
  const admitPreparation = () => {
    if (isOakViewportSupported()) return true;
    update({ error: oakViewportNotice });
    return false;
  };
  const prepare = async (inputs: readonly OakDocumentInput[], nextOwner: OakDocumentsOwner) => {
    if (!admitPreparation()) return;
    own(nextOwner); cancel("replace");
    continuation = null;
    const run = { controller: new AbortController(), job: null as OakDocumentJob | null, version: ++version, inputs };
    active = run; update({ pending: true, error: null, failedFiles: [], phase: "Preparing documents" });
    const current = () => active === run && run.version === version && owner?.conversationId === nextOwner.conversationId && owner?.accountEpoch === nextOwner.accountEpoch;
    try {
      const result = await client.prepare(inputs, nextOwner.conversationId, run.controller.signal, {
        job: job => { run.job = job; if (!current()) cancelJob(job); }, progress: phase => { if (current()) update({ phase }); },
      });
      if (!current()) return;
      // A prepared file is no longer waiting: its staged row goes, so the panel never shows it as "Ready to prepare" again.
      prepared = result; restoredDocuments = []; active = null; stagedFiles = [];
      update({ documents: result.outputs.map(({ receipt: _receipt, ...content }) => content), pending: false, phase: "Preview ready. Choose the sections Oak should read.",
        names: oakDocumentNames(result.outputs, inputs),
        selections: [], usedSelections: [], selectedBytes: 0, expiresAt: result.expiresAt, restored: false, error: null, stagedFiles: [], stagedSizes: [] });
    } catch (error) {
      if (!current()) return;
      active = null; run.controller.abort();
      if (error instanceof OakDocumentOcrRequired) {
        ocrSource = error;
        const p = error.receipt.payload;
        update({ pending: false, phase: 'Oak reads this PDF page by page as images. Read the pages, then choose what to use.',
          error: null, ocrSource: { label: error.input.label, pages: p.pdfPages, bytes: p.originalBytes, expiresAt: p.expiresAt } });
        const source = error;
        void client.scanAllowance(source.job, new AbortController().signal).then(allowance => {
          if (ocrSource === source) update({ scanAllowance: allowance });
        }, () => { /* The card still offers the scan; the server enforces every limit. */ });
        ocrSourceExpiry = setTimeout(() => { cancel('source-expired'); stagedFiles = []; update({ stagedFiles: [], pending: false,
          error: 'Scanned-PDF reading permission expired. Choose and prepare the file again explicitly.' }); }, Math.max(0, p.expiresAt - now()));
        return;
      }
      if (run.job) cancelJob(run.job);
      // shortcut: a batch failure marks every file in that batch, since the error does not name one; per-file errors would need the Worker to say which.
      update({ pending: false, phase: "", error: oakDocumentFailure(error), failedFiles: inputs.flatMap(input => input.body instanceof File ? [input.label] : []) });
    }
  };
  const selectForTurn = (selections = state.selections) => {
    try {
      if (!prepared || prepared.expiresAt <= now()) throw new OakDocumentError("document-expired");
      const readSet = oakDocumentReadSet(state.documents, selections);
      update({ usedSelections: selections.map(item => ({ ...item })), selectedBytes: readSet.bytes, error: null }); return true;
    } catch (error) { update({ usedSelections: [], error: oakDocumentFailure(error) }); return false; }
  };
  const installFreshOwned = (value: ReopenedSavedDocuments, nextOwner: OakDocumentsOwner, phase = 'Saved documents reopened. Choose the text Oak may read in your next answer.') => {
    const fresh = reopenedSavedDocumentsSchema.parse(value);
    if (fresh.operation.conversationId !== nextOwner.conversationId || fresh.outputs.some(output => {
      const claim = output.receipt.payload;
      return claim.conversationId !== nextOwner.conversationId || claim.principalHash !== fresh.operation.principalHash ||
        claim.submissionId !== fresh.operation.submissionId || claim.generation !== fresh.operation.generation || claim.expiresAt <= now();
    })) throw new OakDocumentError('document-invalid-response');
    const durable = durableSavedDocuments(fresh.outputs, fresh.selections);
    const expiresAt = Math.min(...fresh.outputs.map(output => output.receipt.payload.expiresAt));
    disposeOwned('restore'); owner = nextOwner;
    prepared = { operation: fresh.operation, outputs: fresh.outputs, expiresAt };
    completedOcrJob = fresh.outputs.some(output => output.sourceMapping === 'openrouter-file-annotation-v1') ? fresh.operation : null;
    update({ documents: durable.documents.map(({ label: _label, parserRevision: _parser, processorRevision: _processor, ...content }) => content),
      selections: fresh.selections, usedSelections: [], selectedBytes: 0, expiresAt, restored: false, phase });
  };
  const prepareFiles = (files: readonly File[], nextOwner: OakDocumentsOwner) => {
    const inputs: OakDocumentInput[] = [];
    for (const file of files) {
      const extension = file.name.toLowerCase().split('.').at(-1);
      if (extension !== 'txt' && extension !== 'pdf' && extension !== 'docx') {
        update({ error: 'Choose TXT, DOCX or digital PDF. Paste the text for other formats.', failedFiles: [file.name] }); return Promise.resolve();
      }
      inputs.push({ kind: extension, body: file, label: file.name });
    }
    return prepare(inputs, nextOwner);
  };
  return {
    snapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** Dev state gallery only: show a fixture snapshot without starting document work. */
    setFixture: (next: Partial<OakDocumentsSnapshot>) => update(next),
    open: (nextOwner: OakDocumentsOwner) => { own(nextOwner); update({ open: true }); },
    close: () => { cancel("panel-close"); update({ open: false }); },
    cancel, disposeOwned, prepare,
    stageFiles,
    /** The controller owns the staged File list, so a remounted panel removes the right file. */
    unstageFile: (index: number, nextOwner: OakDocumentsOwner) => stageFiles(stagedFiles.filter((_file, at) => at !== index), nextOwner),
    prepareStagedFiles: (nextOwner: OakDocumentsOwner) => {
      if (owner?.conversationId !== nextOwner.conversationId || owner.accountEpoch !== nextOwner.accountEpoch) { own(nextOwner); return Promise.resolve(); }
      return prepareFiles(stagedFiles, nextOwner);
    },
    setOcrConsent: (scopeAndTerms: boolean, visitorCharges: boolean) => update({ ocrScopeConsent: scopeAndTerms, ocrChargeConsent: visitorCharges }),
    fundingChanged: () => {
      if (!quoteFunding) return;
      try {
        const next = funding();
        if (sameOcrFundingAuthority(next, quoteFunding) && next.expiresAt > now()) { quoteFunding = next; return; }
      } catch { /* Removed authority invalidates dispatch permission, never owned status. */ }
      const attempted = state.ocrAttempted;
      invalidateOcr(false); update({ pending: false, error: attempted ?
        'Your funding changed. This source already has a confirmed operation. Check its status explicitly; no retry is authorized.' :
        'Your funding changed. Request a new OCR quote explicitly.' });
    },
    // Dormant paid transport stays status-only. Old callers cannot create new authority.
    requestOcrQuote: async (_nextOwner: OakDocumentsOwner, _cap: number) => {
      update({ error: 'Scanned-page reading is unavailable right now. Paste the text instead.' });
    },
    confirmOcr: async (_nextOwner: OakDocumentsOwner, _quoteId: string) => {
      update({ error: 'New paid OCR operations are unavailable. Existing operation status and holds are retained.' });
    },
    /** Read the staged scanned PDF with Gemini, on the visitor's connected key when one is selected, else Oak's. */
    confirmScan: async (nextOwner: OakDocumentsOwner) => {
      const source = ocrSource;
      if (!source || state.pending || owner?.conversationId !== nextOwner.conversationId || owner.accountEpoch !== nextOwner.accountEpoch) return;
      let visitorSession: VisitorFundingSession | undefined;
      try { const connected = funding(); if (connected.expiresAt > now()) visitorSession = connected.session; } catch { /* Oak's key pays. */ }
      const run = { controller: new AbortController(), job: source.job, version: ++version, inputs: [source.input] };
      active = run; update({ pending: true, error: null, phase: `Reading ${source.receipt.payload.pdfPages === 1 ? 'the page' : `${source.receipt.payload.pdfPages} pages`}` });
      const current = () => active === run && run.version === version && owner?.conversationId === nextOwner.conversationId;
      try {
        const result = await client.scan(source, run.controller.signal, visitorSession);
        if (!current()) return;
        clearTimeout(ocrSourceExpiry); ocrSource = null;
        prepared = result; restoredDocuments = []; active = null; stagedFiles = [];
        update({ documents: result.outputs.map(({ receipt: _receipt, ...content }) => content), pending: false, names: oakDocumentNames(result.outputs, [source.input]),
          phase: 'Pages read. Check the text, then choose the sections Oak should use.', selections: [], usedSelections: [], selectedBytes: 0,
          expiresAt: result.expiresAt, restored: false, error: null, stagedFiles: [], stagedSizes: [], ocrSource: null, scanAllowance: null });
      } catch (error) {
        if (!current()) return;
        active = null;
        const code = error instanceof OakDocumentError ? error.code : '';
        update({ pending: false, phase: '', error: code === 'document-daily-cap' ? 'You have read 20 scanned pages today. Paste the text, or try again tomorrow.' :
          code === 'document-capacity' ? 'Scanned-page reading is paused for now. Paste the text instead.' :
          code === 'document-failed' ? 'Oak could not read these pages. Paste the text instead.' : oakDocumentFailure(error) });
      }
    },
    checkOcrStatus: async () => {
      if (state.pending || !state.ocrQuote || !state.ocrAttempted || !state.ocrSource) return;
      // The server resolves the current document principal. Funding is not read authority.
      const quote = state.ocrQuote, controller = new AbortController(); ocrRun = controller;
      try {
        update({ pending: true, error: null });
        let currentFunding: VisitorFundingSession | undefined;
        try { const connected = funding(); if (connected.expiresAt > now()) currentFunding = connected.session; }
        catch { /* Owned status remains available without a connected spending key. */ }
        const status = await ocr.status(quote.quoteId, controller.signal, currentFunding);
        if (ocrRun !== controller) return;
        update({ ocrStatus: status, phase: status.actualCharge === 'verified' ? (state.ocrInference ?
          'OCR preview remains available. Provider-reported charges are reconciled.' : 'Provider-reported OCR charges are reconciled. No verified extraction is available.') : status.actualCharge === 'unknown' ? (state.ocrInference ?
          'OCR preview remains available. Charges remain unknown.' : 'OCR charges remain unknown. No verified extraction is available.') :
          'OCR was not dispatched. No scanned text was extracted.' });
      } catch (error) { if (ocrRun === controller) update({ error: oakOcrFailure(error) }); }
      finally { if (ocrRun === controller) { ocrRun = null; update({ pending: false }); } }
    },
    stageAccountContinuation: (nextOwner: OakDocumentsOwner) => {
      const retained = prepared && owner?.conversationId === nextOwner.conversationId && prepared.expiresAt > now() && !restoredDocuments.length ?
        { prepared, selections: [...state.selections], owner: nextOwner } : null;
      // The private preview and guest reading authority disappear before account UI re-renders.
      disposeOwned('guest-account-continuation'); owner = nextOwner; continuation = retained;
    },
    resumeAccountContinuation: async (nextOwner: OakDocumentsOwner) => {
      const candidate = continuation;
      if (!candidate || candidate.owner.conversationId !== nextOwner.conversationId || candidate.owner.accountEpoch !== nextOwner.accountEpoch) return;
      if (!admitPreparation()) { update({ open: true, continuationAvailable: true }); return; }
      cancel('account-document-reissue');
      const run = { controller: new AbortController(), job: null, version: ++version, inputs: [] };
      active = run; update({ pending: true, phase: 'Restoring your document preview', error: null, continuationAvailable: false });
      const current = () => active === run && version === run.version && continuation === candidate && owner?.conversationId === nextOwner.conversationId && owner.accountEpoch === nextOwner.accountEpoch;
      try {
        const fresh = await client.reissue(candidate.prepared, candidate.selections, run.controller.signal);
        if (!current()) return;
        active = null;
        installFreshOwned(fresh, nextOwner, 'Document preview continued with your account. Choose the text Oak may read again. Nothing was saved.');
        update({ open: true });
      } catch (error) {
        if (!current()) return;
        active = null; update({ pending: false, open: true, phase: '', continuationAvailable: true,
          error: 'Your account continued, but the document preview could not reopen. Retry document continuation explicitly or add the text again.' });
      }
    },
    setPaste: (paste: string) => update({ paste, error: null }),
    preparePaste: (nextOwner: OakDocumentsOwner) => prepare([{ kind: "paste", body: new Blob([state.paste], { type: "text/plain" }), label: "Pasted text" }], nextOwner),
    prepareFiles,
    setSelections: (selections: readonly OakDocumentSelection[]) => { update({ selections: [...selections], usedSelections: [], selectedBytes: 0, error: null }); },
    selectForTurn,
    clearUse: () => update({ usedSelections: [], selectedBytes: 0, error: null }),
    turnContext: (): OakDocumentTurnContext | null => {
      if (!prepared || !state.usedSelections.length) return null;
      if (prepared.expiresAt <= now()) throw new OakDocumentError("document-expired");
      oakDocumentReadSet(state.documents, state.usedSelections);
      return { operation: prepared.operation, outputs: prepared.outputs, selections: [...state.usedSelections] };
    },
    proofForExplicitSave: () => {
      if (!prepared) return null;
      if (prepared.expiresAt <= now()) throw new OakDocumentError('document-expired');
      return { operation: prepared.operation, outputs: [...prepared.outputs], selections: [...state.usedSelections] };
    },
    installFreshOwned,
    serializeForExplicitSave: (): OakDocumentsSavedValue => ({ documents: state.documents.map(content => {
      const output = prepared?.outputs.find(item => item.documentId === content.documentId);
      const restored = restoredDocuments.find(item => item.documentId === content.documentId);
      if (!output && !restored) throw new OakDocumentError("document-invalid-response");
      return { ...documentContentSchema.parse(content), label: `Document ${Math.min(...content.slots) + 1}`,
        parserRevision: output?.receipt.payload.parserRevision ?? restored!.parserRevision,
        processorRevision: output?.receipt.payload.processorRevision ?? restored!.processorRevision };
    }),
      selections: state.usedSelections.map(selection => documentSelectionSchema.parse(selection)) }),
    restoreOwned: (value: OakDocumentsSavedValue, nextOwner: OakDocumentsOwner) => {
      const documents = value.documents.map(({ label: _label, parserRevision: _parser, processorRevision: _processor, ...content }) => documentContentSchema.parse(content));
      if (documents.length > documentLimits.files || new Set(documents.map(item => item.documentId)).size !== documents.length ||
          documents.reduce((sum, item) => sum + new TextEncoder().encode(item.text).byteLength, 0) > documentLimits.submissionTextBytes) throw new OakDocumentError("document-input-limit");
      const selections = value.selections.map(selection => documentSelectionSchema.parse(selection));
      if (selections.length) oakDocumentReadSet(documents, selections);
      disposeOwned("restore"); owner = nextOwner; restoredDocuments = value.documents.map(item => ({ ...item }));
      update({ documents, selections, restored: true });
    },
  };
}
const documentsWorkspace = createOakDocumentsWorkspace();
oakFundingMemory.subscribe(documentsWorkspace.fundingChanged);
export const getOakDocumentsController = () => documentsWorkspace;
export const getOakDocumentsWorkspace = documentsWorkspace.snapshot;
export const getOakDocumentTurnContext = documentsWorkspace.turnContext;
export const subscribeOakDocuments = documentsWorkspace.subscribe;
export function useOakDocumentsWorkspace() { return useSyncExternalStore(subscribeOakDocuments, getOakDocumentsWorkspace, () => empty); }
