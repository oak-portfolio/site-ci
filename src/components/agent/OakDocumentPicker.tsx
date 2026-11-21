import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, FieldControl } from "@/components/ui/field";
import { Icon } from "@/components/ui/Icon";
import { MeterBar } from "@/components/ui/meter";
import { revealWordCount } from "@/components/ui/reveal-text";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Attachment, AttachmentContent, AttachmentDescription, AttachmentMedia, AttachmentTitle } from "@/components/ui/attachment";
import { oakDocumentReadSet, oakSectionName, type OakDocumentSelection } from "@/lib/oakDocumentsWorkspace";
import { documentLimits, type DocumentContent } from "../../../packages/oak-agent-contracts/src/documents";
import { OakSprite, type OakActivitySpritePose } from "./OakActivitySprite";

/*
 * R12 documents (Oak's round-12 review): a recruiter drops a resume or job post and picks what Oak reads. The file card says
 * what it is and how long it stays readable; the picker says what is in and out, what each part costs of one answer, and
 * offers Select all and Clear; one meter shows the whole selection against one answer's reading room.
 */

const warnings: Record<string, string> = {
  "line-ending-normalized": "Line endings were standardized. Other spacing and Unicode are preserved.",
  "no-factual-authority": "Visitor text cannot establish Steve’s accomplishments.",
  "processor-coverage-unverified": "The extraction may omit content. Check this preview against your original.",
  "images-charts-comments-and-notes-may-be-omitted": "Images, charts, comments and notes may be missing.",
  "images-charts-notes-and-reading-order-unverified": "Images, charts, notes and reading order have not been verified.",
  "page-count-only-no-text-map": "The page count was checked. Extracted text has no verified page mapping.",
  "reading-order-unverified": "Reading order has not been verified.",
  "source-sections-unverified": "Text blocks come from the extracted text. They have no verified mapping to original sections.",
  "ocr-visual-content-unverified": "OCR text does not verify diagrams, images or other visual content. Compare the preview with the original PDF.",
  "ocr-low-confidence": "The parser reported low confidence. Check the extracted text against the original PDF.",
  "tables-coverage-unverified": "Table extraction has not been verified.",
  "headers-coverage-unverified": "Header extraction has not been verified.",
  "footers-coverage-unverified": "Footer extraction has not been verified.",
  "comments-coverage-unverified": "This document contains comments. Their extraction has not been verified.",
  "footnotes-coverage-unverified": "This document contains footnotes. Their extraction has not been verified.",
  "endnotes-coverage-unverified": "This document contains endnotes. Their extraction has not been verified.",
  "external-relationships-not-fetched-by-preflight": "Linked external content was not fetched during the document check.",
  "docx-layout-unverified": "DOCX text follows the document body order. Visual layout and page positions have not been verified.",
  "docx-content-omitted": "Some DOCX content was omitted. Check the preview against your original before relying on it.",
  "docx-fields-not-evaluated": "DOCX fields were not evaluated, so their displayed results may be missing.",
  "docx-media-not-extracted": "DOCX images and other media were not extracted. Only the available body text is shown.",
  "pdf-layout-unverified": "Visual layout, columns and table relationships have not been verified.",
};

export const documentPose = (kind: string): OakActivitySpritePose => kind === "pdf" ? "doc-pdf" : kind === "docx" ? "doc-docx" : "doc-text";
/** The parts of a document with text in them; blank-line blocks get no row. */
export const readableSections = (document: DocumentContent) => document.sections.filter(section => document.text.slice(section.start, section.end).trim());

const encoder = new TextEncoder();
// The selection envelope without excerpts (same keys as oakDocumentReadSet), so an estimate starts where the exact check does.
const envelopeBytes = encoder.encode(JSON.stringify({ authority: "visitor-text-only", offsetUnit: "utf16", excerpts: [], includedUtf16: 0,
  availableUtf16: 0, omittedUtf16: 0, coverage: "selected-spans-only" })).byteLength + 12;
/** About what one stretch of text costs of an answer's reading room: its words plus its label. The exact check runs on Use. */
function excerptBytes(document: DocumentContent, sectionId: string, start: number, end: number) {
  const section = document.sections.find(entry => entry.id === sectionId);
  return encoder.encode(JSON.stringify({ sourceId: `visitor-document:${document.documentId}:${sectionId}:${start}-${end}`, label: "Document 1",
    ...(section?.originalSource ? { originalSource: section.originalSource } : {}), sectionId, start, end,
    ...(section?.sourcePage !== undefined ? { sourcePage: section.sourcePage } : {}), text: document.text.slice(start, end), warnings: document.warnings,
    extractionCompleteness: document.extractionCompleteness })).byteLength + 1;
}

export type OakReadingRoom = { used: number; max: number; percent: number; over: boolean; tooMany: boolean; count: number };
/** How much of one answer's reading room the selection takes. Exact when it fits; an estimate once it is over. */
export function oakReadingRoom(documents: readonly DocumentContent[], selections: readonly OakDocumentSelection[]): OakReadingRoom {
  const max = documentLimits.contextBytes, count = selections.length, tooMany = count > documentLimits.selections;
  if (!count) return { used: 0, max, percent: 0, over: false, tooMany: false, count };
  let used: number | null = null, tooLarge = false;
  try { used = oakDocumentReadSet(documents, selections).bytes; }
  catch (error) { tooLarge = (error as { code?: string })?.code === "document-selection-too-large"; /* else a stale selection: estimate below */ }
  if (used === null) used = selections.reduce((sum, item) => {
    const document = documents.find(entry => entry.documentId === item.documentId);
    return sum + (document ? excerptBytes(document, item.sectionId, item.start, item.end) : 0);
  }, envelopeBytes);
  // The exact check is the authority: when it says too large, the meter says over even if the estimate lands under.
  if (tooLarge) used = Math.max(used, max + 1);
  return { used, max, percent: Math.max(1, Math.round(used / max * 100)), over: tooLarge || used > max, tooMany, count };
}

/** Share of one answer a single part takes on its own, rounded so a short line still reads as 1%. */
const sectionShare = (document: DocumentContent, section: DocumentContent["sections"][number]) =>
  Math.max(1, Math.round(excerptBytes(document, section.id, section.start, section.end) / (documentLimits.contextBytes - envelopeBytes) * 100));

function SectionChoice({ document, section, selection, onChange, disabled }: {
  document: DocumentContent; section: DocumentContent["sections"][number]; selection?: OakDocumentSelection;
  onChange: (value: OakDocumentSelection | null) => void; disabled: boolean;
}) {
  const controlId = React.useId();
  const [rangeError, setRangeError] = React.useState<string | null>(null);
  const excerpt = React.useRef<HTMLTextAreaElement | null>(null);
  const text = document.text.slice(section.start, section.end);
  // v3 review: a part is named by its page or its opening words, never "Block 3".
  const sectionLabel = oakSectionName(text, section.sourcePage);
  const share = sectionShare(document, section), alone = share > 100;
  const chooseRange = () => {
    const start = excerpt.current?.selectionStart ?? 0, end = excerpt.current?.selectionEnd ?? 0;
    if (end <= start) { setRangeError("Highlight the words you want in this part, then choose Use highlighted text."); return; }
    setRangeError(null);
    onChange({ documentId: document.documentId, sectionId: section.id, start: section.start + start, end: section.start + end });
  };
  const partial = selection ? selection.end - selection.start < text.length : false;
  // One row: the check, the part's own words as its label with its page and share tags, and the highlight action.
  return <section className="oak-documents__section" aria-label={sectionLabel} data-selected={selection ? "" : undefined}>
    <div className="oak-documents__choice">
      <Checkbox id={controlId} checked={Boolean(selection)} disabled={disabled} aria-label={`Let Oak read: ${sectionLabel}`}
        aria-describedby={`${controlId}-share`}
        onCheckedChange={checked => { setRangeError(null); onChange(checked ? { documentId: document.documentId, sectionId: section.id, start: section.start, end: section.end } : null); }} />
      <div className="oak-documents__part">
        <Field>
          <FieldControl ref={excerpt} aria-label={sectionLabel} render={<Textarea variant="bare" rows={Math.min(6, Math.max(1, text.split("\n").length, Math.ceil(text.length / 56)))} />} readOnly value={text} />
        </Field>
        <span className="oak-documents__tags">
          {section.sourcePage !== undefined ? <span className="oak-documents__tag"><Icon name="bookOpenText" size={12} />Page {section.sourcePage}</span> : null}
          {partial ? <span className="oak-documents__tag" data-tone="selected"><Icon name="highlighter" size={12} />Highlighted part only</span> : null}
          <span id={`${controlId}-share`} className="oak-documents__tag" data-tone={alone && !partial ? "over" : "share"}>
            {alone && !partial ? <><Icon name="alert" size={12} />Too long for one answer, highlight a passage</> : <>{share}% of one answer</>}
          </span>
        </span>
      </div>
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon" />} type="button" aria-label="Use highlighted text" disabled={disabled}
          onClick={chooseRange}><Icon name="highlighter" size={16} /></TooltipTrigger>
        <TooltipContent positionerClassName="oak-composer__tooltip">Use highlighted text only</TooltipContent>
      </Tooltip>
    </div>
    {rangeError ? <p className="oak-documents__range" role="status">{rangeError}</p> : null}
  </section>;
}

/** Minutes left on a preview's reading permission, refreshed every half minute while the panel is open. */
export function useMinutesLeft(expiresAt: number | null) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return expiresAt ? Math.ceil((expiresAt - now) / 60_000) : null;
}

/** One prepared document: the file card, its extraction notes, and the parts to choose from. */
export function OakDocumentPreview({ document, name, selections, expiresAt, restored, disabled, onSelect }: {
  document: DocumentContent; name: string; selections: readonly OakDocumentSelection[]; expiresAt: number | null; restored: boolean;
  disabled: boolean; onSelect: (next: OakDocumentSelection[]) => void;
}) {
  const parts = readableSections(document);
  const mine = selections.filter(item => item.documentId === document.documentId);
  const others = selections.filter(item => item.documentId !== document.documentId);
  const chosen = mine.length;
  const minutes = useMinutesLeft(restored ? null : expiresAt);
  const expired = minutes !== null && minutes <= 0;
  // Once reading time ends, or for a saved copy, the parts stay readable but cannot be chosen; the file has to be added again.
  const locked = disabled || expired || restored;
  const kindLabel = document.kind === "paste" ? "Pasted text" : document.kind.toUpperCase();
  const whole = (section: DocumentContent["sections"][number]): OakDocumentSelection =>
    ({ documentId: document.documentId, sectionId: section.id, start: section.start, end: section.end });
  const change = (sectionId: string, value: OakDocumentSelection | null) =>
    onSelect([...selections.filter(item => item.documentId !== document.documentId || item.sectionId !== sectionId), ...(value ? [value] : [])]);
  // Select all keeps a highlighted passage as it is and adds every other part whole; Clear empties this document only.
  const selectAll = () => onSelect([...others, ...parts.map(section => mine.find(item => item.sectionId === section.id) ?? whole(section))]);
  const status = restored ? { tone: "saved", icon: "archive" as const, text: "Saved copy. Add it again to let Oak read it." }
    : expired ? { tone: "expired", icon: "clock" as const, text: "Reading time ended. Add the file again to use it." }
    : minutes !== null ? { tone: "ready", icon: "lock" as const, text: `Private, readable for ${minutes} more ${minutes === 1 ? "minute" : "minutes"}` } : null;
  // D116: the document is a plain header over one group of part rows, not a card around cards.
  return <article className="oak-documents__preview oak-documents__doc" data-expired={expired ? "" : undefined}>
    <Attachment state="done">
      <AttachmentMedia><OakSprite pose={documentPose(document.kind)} size="badge" /></AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle><span className="oak-documents__title">{name}</span></AttachmentTitle>
        {/* Words, not bytes: a visitor counts a resume in words (Oak, D136). */}
        <AttachmentDescription>{kindLabel} · {revealWordCount(document.text).toLocaleString()} words · {parts.length} {parts.length === 1 ? "part" : "parts"}</AttachmentDescription>
        {status ? <span className="oak-documents__expiry" data-tone={status.tone}><Icon name={status.icon} size={12} />{status.text}</span> : null}
      </AttachmentContent>
      <Badge variant={chosen ? "default" : "secondary"} className="oak-documents__count-badge">{chosen === parts.length && chosen ? "All parts" : `${chosen} of ${parts.length}`}</Badge>
    </Attachment>
    <Disclosure summary="Extraction notes" count={document.warnings.length}>
      <p>{document.extractionCompleteness === "unknown" ? "Original content missing from extraction is unknown." : "Text normalization is complete."} Choose the parts below. Selection does not send a question.</p>
      <ul className="oak-documents__warnings">{document.warnings.map(warning => <li key={warning}>{warnings[warning] ?? "The extraction has an additional warning. Check it against your original before relying on it."}</li>)}</ul>
      <p>{document.pageMapping === 'verified-pages' ? 'Private references retain the checked PDF page association. Source positions describe extracted text, not places in the original PDF or its visual layout.' : document.pageMapping === 'provider-pages' ? 'Page numbers come from the scanned-page reader and have not been independently checked against the original PDF. Source positions describe extracted text, not places in the original PDF or its visual layout.' : 'Page mapping is unavailable. Private references identify extracted text blocks.'} They cannot establish Steve’s accomplishments. Text you leave unselected is separate from any original content the extraction may have missed.</p>
    </Disclosure>
    {parts.length ? <fieldset className="oak-documents__sections">
      <legend className="sr-only">Choose what Oak reads from {name}</legend>
      <div className="oak-documents__picker-head">
        <span className="oak-documents__picker-title" aria-hidden="true">Choose what Oak reads</span>
        <div className="oak-documents__bulk">
          <Button type="button" variant="ghost" size="sm" focusableWhenDisabled disabled={locked || chosen === parts.length} onClick={selectAll}
            aria-label={`Select every part of ${name}`}><Icon name="checkList" />Select all</Button>
          <Button type="button" variant="ghost" size="sm" focusableWhenDisabled disabled={locked || !chosen} onClick={() => onSelect(others)}
            aria-label={`Clear the parts chosen from ${name}`}><Icon name="cancel" />Clear</Button>
        </div>
      </div>
      <div className="oak-group__body">
        {/* Blank-line blocks hold nothing to read, so they get no row. */}
        {document.sections.map(section => {
          const selection = mine.find(item => item.sectionId === section.id);
          if (!selection && !document.text.slice(section.start, section.end).trim()) return null;
          return <SectionChoice key={section.id} document={document} section={section} disabled={locked}
            selection={selection} onChange={value => change(section.id, value)} />;
        })}
      </div>
    </fieldset> : <p className="oak-documents__note">This file has no readable text. Paste the text below, or try another file.</p>}
  </article>;
}

/** The whole selection against one answer's reading room: a count, a percentage and a bar that turns gold once it is over. */
export function OakReadingRoomMeter({ room }: { room: OakReadingRoom }) {
  const label = room.count ? `${room.count} ${room.count === 1 ? "part" : "parts"} selected` : "Nothing selected yet";
  const share = room.over ? "More than one answer can read" : `${room.percent}% of one answer`;
  return <div className="oak-documents__room" data-tone={room.over || room.tooMany ? "over" : room.count ? "ready" : "empty"}>
    <div className="oak-documents__room-head">
      <span className="oak-documents__room-count"><Icon name={room.over || room.tooMany ? "alert" : room.count ? "checkmark" : "checkList"} size={14} />{label}</span>
      <span className="oak-documents__room-share">{room.count ? share : "Tick the parts Oak should read"}</span>
    </div>
    <MeterBar value={Math.min(room.used, room.max)} max={room.max} aria-label={room.count ? `${label}, ${share}` : label} />
    {/* One always-mounted live region, so a screen reader hears the note when it appears, not only when it changes. */}
    <p className="oak-documents__room-note" role="status">
      {room.over ? "That is more than one answer reads. Clear a part, or highlight a shorter passage."
        : room.tooMany ? `One answer reads up to ${documentLimits.selections} parts. Clear ${room.count - documentLimits.selections} to continue.` : ""}
    </p>
  </div>;
}
