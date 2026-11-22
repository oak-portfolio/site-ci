import * as React from "react";
import { OakOcrReview } from './OakOcrReview';
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, FieldControl, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentDescription, AttachmentDropzone, AttachmentGroup, AttachmentMedia, AttachmentTitle } from "@/components/ui/attachment";
import { OAK_COMPARE_SECTION_LIMIT, getOakDocumentsController, oakCompareSectionNote, oakDocumentName, oakReadsAsRole, oakSelectedText, useOakDocumentsWorkspace, type OakDocumentsOwner } from "@/lib/oakDocumentsWorkspace";
import { oakMeaningIcons } from "@/lib/oakMeaningIcons";
import { WorkflowPanel } from "./WorkflowPanel";
import { OakSprite, type OakActivitySpritePose } from "./OakActivitySprite";
import { OakDocumentPreview, OakReadingRoomMeter, documentPose, oakReadingRoom, useMinutesLeft } from "./OakDocumentPicker";
import { openOakSurface } from "@/lib/oakWorkspace";

export { oakReadsAsRole };

/**
 * The stages the documents client reports while it prepares files (oakDocumentsClient progress), shown as task rows
 * (beautiful-ui TaskRows): done, running with its "2 of 3", or waiting. Real stages only; no invented percentage.
 */
const documentStages = [
  { label: "Upload privately", match: /^Preparing documents/ },
  { label: "Check each file", match: /^Checking document (\d+) of (\d+)/ },
  { label: "Check them together", match: /^Checking the complete document set/ },
  { label: "Extract the text", match: /^Extracting document (\d+) of (\d+)/ },
  { label: "Finish the preview", match: /^Finishing the preview/ },
] as const;

function DocumentSteps({ phase }: { phase: string }) {
  const at = documentStages.findIndex(stage => stage.match.test(phase));
  if (at < 0) return null;
  const count = phase.match(documentStages[at]!.match);
  return <ol className="oak-documents__steps" aria-label="Preparation steps">
    {documentStages.map((stage, index) => {
      const state = index < at ? "done" : index === at ? "running" : "pending";
      return <li key={stage.label} data-state={state}>
        <span className="oak-documents__step-node" aria-hidden="true">
          {state === "done" ? <Icon name="checkmark" size={14} /> : state === "running" ? <Spinner aria-hidden="true" /> : null}
        </span>
        <span>{stage.label}<span className="sr-only">, {state === "done" ? "done" : state === "running" ? "in progress" : "waiting"}</span></span>
        {state === "running" && count?.[2] ? <span className="oak-documents__step-count">{count[1]} of {count[2]}</span> : null}
      </li>;
    })}
  </ol>;
}

const accept = ".txt,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const extension = (name: string) => (name.split(".").at(-1) ?? "").toUpperCase();
/** Q11-G4: a short sample role so a first-time visitor can see the whole flow without a file of their own. */
export const oakSampleDocument = `Senior Design Engineer, AI Products

About the team
We build the assistant people use to explore and compare work. You will join a small product team that ships weekly.

What you'll do
- Build agent interfaces in React and TypeScript, from first sketch to production.
- Design streaming, citation and tool-use states with research and engineering.
- Own accessibility and performance for every surface you ship.

Requirements
- 5+ years of experience building production web interfaces.
- A portfolio that shows interaction design and front-end engineering together.
- Comfort working with language models, evaluations and prompt design.`;

/** Private preview occupies the existing scrollable reading area, never the fixed composer. */
type DocumentSaving = { ready: boolean; busy: boolean; pending: boolean; completed: boolean; error: string | null; onSave: () => void };
export function OakDocumentsPanel({ owner, onReturn, saving }: { owner: OakDocumentsOwner; onReturn: () => void; saving?: DocumentSaving }) {
  const state = useOakDocumentsWorkspace(), controller = getOakDocumentsController();
  const stage = (files: File[]) => controller.stageFiles(files, owner);
  // R12: every "paste the text instead" next step lands in the paste field, ready to type.
  const pasteField = React.useRef<HTMLTextAreaElement | null>(null);
  const focusPaste = () => {
    const field = pasteField.current;
    if (!field) return;
    field.scrollIntoView({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    field.focus({ preventScroll: true });
  };
  // Q11-G4: clipboard text becomes a document in one step; a denied or empty clipboard says so and leaves the field to the visitor.
  const [clipboardNote, setClipboardNote] = React.useState<string | null>(null);
  const prepareText = (text: string) => { controller.setPaste(text); void controller.preparePaste(owner); };
  const pasteFromClipboard = async () => {
    setClipboardNote(null);
    const text = await navigator.clipboard?.readText?.().catch(() => null) ?? null;
    if (text?.trim()) prepareText(text);
    else setClipboardNote(text === null ? "Your browser kept the clipboard private. Paste into the field below instead." : "The clipboard has no text to read. Copy some text first.");
  };
  // A failed preparation keeps each chosen file's row; only the files that were tried are marked, with Retry beside Remove.
  const failed = !state.pending && state.failedFiles.length > 0;
  const fileFailed = (name: string) => failed && state.failedFiles.includes(name);
  const selectedCount = state.selections.length;
  const selectedText = oakSelectedText(state.documents, state.selections);
  const roleLike = selectedCount > 0 && oakReadsAsRole(selectedText);
  // R12: the selection against one answer's reading room; Use waits until it fits, so it never fails after the click.
  const room = React.useMemo(() => oakReadingRoom(state.documents, state.selections), [state.documents, state.selections]);
  const roomBlocked = room.over || room.tooMany;
  const minutesLeft = useMinutesLeft(state.restored ? null : state.expiresAt);
  const expired = minutesLeft !== null && minutesLeft <= 0;
  // A ready preview, scan card or chosen-file list speaks for itself, so the status line shows only work, errors and lone notes.
  const showStatus = state.pending || Boolean(state.error) || (Boolean(state.phase) && !state.documents.length && !state.ocrSource && !state.stagedFiles.length);
  const pasteInstead = Boolean(state.error && /paste/i.test(state.error));
  // Stage rows appear only once preparation has taken a moment, so a quick text file never flashes them in and out.
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => {
    if (!state.pending) { setSlow(false); return; }
    const timer = setTimeout(() => setSlow(true), 350);
    return () => clearTimeout(timer);
  }, [state.pending]);
  const staged = state.pending && slow && documentStages.some(stage => stage.match.test(state.phase));
  // Before any document is prepared the hero is the fanned stack of the three types it takes (D116).
  const pose: OakActivitySpritePose = state.pending ? "parsing" : state.ocrSource ? "scanner" : selectedCount ? "highlighting" : state.documents.length ? "document" : "doc-stack";
  return <WorkflowPanel title="Private documents" returns="Oak reads only the text you select, for one answer." pose={pose} busy={state.pending} onReturn={() => { controller.close(); onReturn(); }} className="oak-documents oak-workspace__workflow"
    tip={{ id: "documents", text: "Add a resume, job post or brief as TXT, DOCX or PDF, then ask me about it or compare it with Steve's work." }}>
    {showStatus ? <div className="oak-documents__status" data-error={state.error ? "" : undefined}>
      {/* One loader at a time: once the stage rows show, the running row carries it. */}
      {state.pending ? staged ? null : <Spinner aria-hidden="true" /> : <Icon name={state.error ? "alert" : "checkmark"} />}
      <p aria-hidden="true">{state.error ?? state.phase}</p>
      {state.pending ? <Button type="button" variant="ghost" size="sm" onClick={() => controller.cancel()}><Icon name="stop" />Stop preparation</Button>
        : pasteInstead ? <Button type="button" variant="ghost" size="sm" onClick={focusPaste}><Icon name="compose" />Paste the text</Button> : null}
    </div> : null}
    {/* One live region that never unmounts, so the switch between the status row and the quiet state is still announced. */}
    <p className="sr-only" role="status" aria-live="polite">{showStatus ? state.error ?? state.phase : state.phase}</p>
    {staged ? <DocumentSteps phase={state.phase} /> : null}
    {state.continuationAvailable ? <Button type="button" variant="secondary" size="sm" disabled={state.pending}
      onClick={() => void controller.resumeAccountContinuation(owner)}><Icon name="retry" />Retry document continuation</Button> : null}
    <OakOcrReview owner={owner} state={state} onPaste={focusPaste} />
    {state.documents.map(document => <OakDocumentPreview key={document.documentId} document={document} name={oakDocumentName(state, document.documentId)}
      selections={state.selections} expiresAt={state.expiresAt} restored={state.restored} disabled={state.pending}
      onSelect={next => controller.setSelections(next)} />)}
    {state.documents.length ? <div className="oak-documents__footer">
      {state.restored || expired ? null : <OakReadingRoomMeter room={room} />}
      <div className="oak-documents__actions">
        <Button type="button" size="sm" disabled={state.pending || !selectedCount || state.restored || roomBlocked || expired} onClick={() => {
          if (controller.selectForTurn()) { controller.close(); onReturn(); }
        }}><Icon name="checkmark" />Use selected text{selectedCount ? ` (${selectedCount})` : ""}</Button>
        {/* Q16-D6: Compare reads at most three sections, said here where the visitor selects them. */}
        {roleLike ? <Button type="button" variant="secondary" size="sm" disabled={state.pending || state.restored || roomBlocked || expired || selectedCount > OAK_COMPARE_SECTION_LIMIT}
          aria-describedby={selectedCount > OAK_COMPARE_SECTION_LIMIT ? "oak-documents-compare-limit" : undefined} onClick={() => {
          // The comparison reads the selected sections themselves, not a copy of their text.
          if (controller.selectForTurn()) openOakSurface("role");
        }}><Icon name="identityFile" />Compare this role</Button> : null}
        {saving ? <Button type="button" variant="secondary" size="sm" disabled={state.pending || state.restored || !saving.ready || saving.busy || !saving.completed}
          onClick={saving.onSave}>{saving.pending ? 'Saving documents…' : 'Save conversation with documents'}</Button> : null}
        {state.usedSelections.length ? <Button type="button" variant="ghost" size="sm" onClick={controller.clearUse}>Clear reading selection</Button> : null}
      </div>
      {roleLike && oakCompareSectionNote(selectedCount) ? <p id="oak-documents-compare-limit" className="oak-documents__note" role="status">{oakCompareSectionNote(selectedCount)}</p> : null}
      {/* One footer line: a save error first, then the restored notice, else the save hint. */}
      {saving?.error || !state.restored ? saving ? <p className="oak-documents__note" role="status">{saving.error ?? (!saving.ready || !saving.completed ?
        'Sign in and complete an answer before saving documents.' : 'Saves the normalized text with this conversation. Edits keep its expiry.')}</p> : null
        : <p className="oak-documents__note">Saved text is here to review. Add it again to let Oak read it.</p>}
    </div> : null}
    <div className="oak-documents__add">
      {/* The drop area shows the three types it takes as their own pictures, so "TXT, DOCX or PDF" reads at a glance. */}
      {state.pending ? null : <AttachmentDropzone onFiles={stage} accept={accept} multiple actionLabel="Choose files" actionIcon={oakMeaningIcons["panel.documents-add"]}
        media={<span className="oak-documents__types"><OakSprite pose="doc-text" size="badge" /><OakSprite pose="doc-docx" size="badge" /><OakSprite pose="doc-pdf" size="badge" /></span>}
        title={state.documents.length ? "Add more files" : "Drop a resume or job post"} description="TXT, DOCX or PDF · up to 3 files · 20 PDF pages" />}
      {state.stagedFiles.length ? <>
        <AttachmentGroup aria-label="Selected files">
          {state.stagedFiles.map((name, index) => <li key={`${name}-${index}`}>
            <Attachment size="sm" state={state.pending ? "processing" : fileFailed(name) ? "error" : "idle"}>
              <AttachmentMedia><OakSprite pose={documentPose(extension(name).toLowerCase())} size="badge" /></AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{name}</AttachmentTitle>
                <AttachmentDescription>{extension(name)} · {state.pending ? "Preparing" : fileFailed(name) ? "Could not prepare" : "Ready to prepare"}</AttachmentDescription>
              </AttachmentContent>
              {state.pending ? null : <AttachmentActions>
                {fileFailed(name) ? <AttachmentAction icon="retry" label={`Retry ${name}`} onClick={() => void controller.prepareStagedFiles(owner)} /> : null}
                <AttachmentAction label={`Remove ${name}`} onClick={() => controller.unstageFile(index, owner)} />
              </AttachmentActions>}
            </Attachment>
          </li>)}
        </AttachmentGroup>
        {state.pending ? null : <div className="oak-documents__actions">
          <Button type="button" size="sm" onClick={() => void controller.prepareStagedFiles(owner)}>{failed ? <><Icon name="retry" />Retry preparing</> : "Prepare selected files"}</Button>
          <p className="oak-documents__note">{failed ? "Your files are still here. Retry, remove the one that failed, or paste its text below."
            : `${state.stagedFiles.length} ${state.stagedFiles.length === 1 ? "file" : "files"} selected. Nothing uploads until you choose Prepare selected files.`}</p>
        </div>}
      </> : null}
      {state.pending ? null : <>
        <div className="oak-documents__divider" aria-hidden="true"><span>or</span></div>
        <Field>
          <FieldLabel><span className="oak-documents__tile" data-oak-tile="compose" aria-hidden="true"><Icon name="compose" /></span>Paste document text</FieldLabel>
          <FieldControl ref={pasteField} render={<Textarea rows={3} />} autoComplete="off" placeholder="Paste a job post, resume or brief"
            value={state.paste} onChange={event => controller.setPaste(event.currentTarget.value)} />
        </Field>
        <div className="oak-documents__actions">
          <Button type="button" variant="secondary" size="sm" disabled={!state.paste.trim()} onClick={() => void controller.preparePaste(owner)}>Prepare pasted text</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void pasteFromClipboard()}><Icon name="clipboardPaste" />Paste from clipboard</Button>
          {state.documents.length ? null : <Button type="button" variant="ghost" size="sm" onClick={() => prepareText(oakSampleDocument)}><Icon name="bookOpenText" />Try a sample role</Button>}
        </div>
        {clipboardNote ? <p className="oak-documents__note" role="status">{clipboardNote}</p> : null}
      </>}
    </div>
    <Disclosure summary={<><OakSprite pose="shield" size="badge" />Privacy and limits</>}>
      <p>Prepare text, review the extraction, then choose what Oak can read in your next answer.</p>
      <p>TXT, paste, DOCX body text and a limited image-free digital PDF subset are prepared by this service without a remote conversion provider. Scanned PDFs need a separate reading step.</p>
      <p>Up to 3 files at a time and 20 PDF pages in all. A file that is too large is turned away with a note, and the server checks actual content and format.</p>
      <p>Original files are never saved. Unsaved text stays in this tab. New conversation or switching accounts clears it. Reading permission expires after 30 minutes.</p>
      {/* D154: an ordinary Save keeps the transcript, and a document answer's quotes are part of it. */}
      <p>Only Save conversation with documents keeps your documents. An ordinary Save keeps the conversation as shown, including any quotes from your documents in Oak's answers, but not the documents themselves. Automatic replies do not add new documents, and document edits do not extend the saved expiry.</p>
    </Disclosure>
  </WorkflowPanel>;
}
