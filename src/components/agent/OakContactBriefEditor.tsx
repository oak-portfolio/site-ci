import * as React from "react";
import { scrollIntoViewGently } from "@/lib/useReducedMotionPreference";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FieldCount, FieldLabel } from "@/components/ui/field";
import { RollingNumber } from "@/components/ui/rolling-number";
import { Icon } from "@/components/ui/Icon";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { briefInputLimits, briefReferenceKey, oakBriefLinkedPageCount, oakBriefMailto, oakContactBriefError, type OakContactBriefDraft } from "@/lib/oakContactBrief";
import { closeOakContactBrief, setOakContactBriefInput, setOakContactBriefText, toggleOakBriefReference, prepareOakContactBrief, restoreOakContactBrief } from "@/lib/oakWorkspace";
import { oakBriefCitationLabel, type OakCitationLabels } from "@/lib/oakCitationLabels";
import { oakMeaningIcons } from "@/lib/oakMeaningIcons";
import { showOakToast } from "@/lib/oakToasts";
import type { OakAnswer, PublicCitation } from "../../../packages/oak-agent-contracts/src/types";
import { WorkflowPanel } from "./WorkflowPanel";

/** The start-date label carries its own caution, since a question here never confirms Steve's availability. */
const fieldLabels = { goals: "What you're after", constraints: "Constraints", startDateQuestion: "Start-date question (Steve confirms availability)" } as const;
/** Each brief row leads with what it asks for in a tinted tile: an aim, a limit, a date (D70, D89, iOS Settings row icons). */
const fieldIcons = { goals: oakMeaningIcons["field.goals"], constraints: oakMeaningIcons["field.constraints"], startDateQuestion: oakMeaningIcons["field.start-date"] } as const;
const fieldTones = { goals: "blue", constraints: "gold", startDateQuestion: "leaf" } as const;
/** D116: an empty well says what belongs in it. */
const fieldPlaceholders = { goals: "For example: I'm hiring a design engineer for our AI team and would like to talk.", constraints: "For example: Remote, US time zones, contract to hire", startDateQuestion: "For example: Is a January start realistic?" } as const;
type BriefField = keyof typeof fieldLabels;
/**
 * Review v4 (Stitch, LinkedIn): a few common reasons to reach Steve, each a chip that fills "What you're after" with an
 * editable example sentence, so a visitor starts from words instead of a blank well.
 */
const goalStarters = [
  { label: "Hiring for a role", icon: "briefcase", text: "I'm hiring for a design engineer role on our AI product team and would like to talk about whether Steve is a fit." },
  { label: "A project to discuss", icon: "puzzle", text: "We're planning an AI feature in our product and would like Steve's view on where to start." },
  { label: "Collaboration", icon: "group", text: "I'd like to collaborate with Steve on an AI tooling project and talk about scope." },
  { label: "Just saying hi", icon: "aiChat", text: "I enjoyed Steve's case studies and would like to connect." },
] as const;

export function OakContactBriefEditor({ draft, references, error, answers = [], citationLabels, onReturnToChat }: {
  answers?: readonly OakAnswer[]; citationLabels?: OakCitationLabels;
  onReturnToChat?: () => void;
  draft: OakContactBriefDraft; references: readonly PublicCitation[]; error: string | null;
}) {
  const [feedback, setFeedback] = React.useState("");
  // PR 1e: the receipt claims one particular draft was opened, so any change to the draft retires it.
  const [opened, setOpened] = React.useState(false);
  // Ticket 23 (keyboard K3): each open after the first re-keys the status line, so a second open is announced too.
  const [opens, setOpens] = React.useState(0);
  const receipt = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { setFeedback(""); setOpened(false); }, [draft.text, draft.needsFormat]);
  React.useEffect(() => { if (opened) scrollIntoViewGently(receipt.current); }, [opened]);
  // Q07 (A18, journey/14): a freshly prepared brief would land below the fold, so it scrolls into view as the proposal.
  const proposal = React.useRef<HTMLElement>(null);
  const prepared = Boolean(draft.text);
  React.useEffect(() => {
    if (!prepared) return;
    scrollIntoViewGently(proposal.current);
  }, [prepared]);
  // D129: the brief starts as one question; constraints and a start date wait behind one row unless already filled.
  const [details, setDetails] = React.useState(() => Boolean(draft.constraints || draft.startDateQuestion));
  const inputError = oakContactBriefError(draft);
  const actionError = oakContactBriefError(draft, true);
  // The summary counts the public pages whose links are in the text that goes into the email, not the references ticked.
  const linkedPages = oakBriefLinkedPageCount(draft.text);
  // Every included reference keeps its row so it can be removed; a page not yet included offers one row, not one per section
  // (LIVE-QA F08: identical-looking rows for one article read as duplicates).
  const included = [...new Map(draft.references.map(reference => [briefReferenceKey(reference), reference])).values()];
  const pages = new Set(included.map(reference => reference.documentId));
  const options = [...included, ...references.filter(reference => !pages.has(reference.documentId) && pages.add(reference.documentId))];
  const copy = async () => {
    if (actionError) { setFeedback(actionError); return; }
    try { await navigator.clipboard.writeText(draft.text); setFeedback("Brief copied. You decide whether to send it."); showOakToast("brief-copied"); }
    catch { setFeedback("Copy is unavailable. Select the brief text to copy it."); }
  };
  // Edit returns to the message to change it; Start over empties the fields, the references and the brief, so nothing of the old draft stays.
  // Focus moves first: the button that was pressed leaves the page with the receipt, and a focused element that vanishes hands focus back to the window.
  const editBrief = () => { document.getElementById("oak-brief-text")?.focus(); setOpened(false); };
  // Start over can be undone while the fields stay empty: the cleared brief is kept here and retires the moment anything new is entered.
  const [cleared, setCleared] = React.useState<OakContactBriefDraft | null>(null);
  const hasContent = Boolean(draft.goals || draft.constraints || draft.startDateQuestion || draft.references.length || draft.text);
  React.useEffect(() => { if (hasContent) setCleared(null); }, [hasContent]);
  const startOver = () => {
    setCleared(draft);
    document.getElementById("oak-brief-goals")?.focus();
    for (const field of ["goals", "constraints", "startDateQuestion"] as const) if (draft[field]) setOakContactBriefInput(field, "");
    for (const reference of draft.references) toggleOakBriefReference(briefReferenceKey(reference));
    setOakContactBriefText("");
    setOpened(false);
  };
  const undoStartOver = () => {
    if (!cleared) return;
    // The whole draft returns as it was: fields, references, and the message with any edit the visitor made to it.
    restoreOakContactBrief(cleared);
    setCleared(null);
    // The button leaving the page would drop focus to the window; hold it on the fields, then move it to the returned message.
    document.getElementById("oak-brief-goals")?.focus();
    requestAnimationFrame(() => document.getElementById("oak-brief-text")?.focus());
  };
  const well = (field: BriefField) => <Field key={field}>
    <FieldLabel htmlFor={`oak-brief-${field}`}>
      <span className="oak-group__icon" aria-hidden="true"><span className="oak-starter-glyph" data-tone={fieldTones[field]}><Icon name={fieldIcons[field]} /></span></span>
      {fieldLabels[field]}
    </FieldLabel>
    <InputGroup>
      <Textarea variant="bare" rows={field === "goals" ? 3 : 1} id={`oak-brief-${field}`} value={draft[field]} placeholder={fieldPlaceholders[field]}
        aria-describedby={`oak-brief-${field}-count oak-brief-feedback`} onChange={event => setOakContactBriefInput(field, event.target.value)} />
      <InputGroupAddon align="inline-end"><FieldCount id={`oak-brief-${field}-count`} value={draft[field].length} limit={briefInputLimits[field]} quiet /></InputGroupAddon>
    </InputGroup>
  </Field>;
  // D116: each field is a labelled well (shadcn Field + InputGroup) with a placeholder and a quiet counter, a roomy gap between them.
  return <WorkflowPanel title="Your contact brief" returns="Only what you write and pick goes in. Nothing is sent or booked here." pose={draft.text ? "brief-letter" : "mailbox"} onReturn={() => { onReturnToChat?.(); closeOakContactBrief(); }} className="oak-brief-editor"
    tip={{ id: "brief", text: "Tell me what you're after and I'll turn it into a short note. You review it and send it yourself." }}>
    <section className="oak-group oak-brief__fields">
      <div className="oak-brief__wells">
        {well("goals")}
        {!draft.goals.trim() ? <div className="oak-brief__starters" role="group" aria-label="Start from an example">
          {goalStarters.map(starter => <button key={starter.label} type="button" className="oak-brief__starter"
            onClick={() => { setOakContactBriefInput("goals", starter.text); document.getElementById("oak-brief-goals")?.focus(); }}>
            <Icon name={starter.icon} size={14} />{starter.label}
          </button>)}
        </div> : null}
        <details className="oak-brief__more" open={details} onToggle={event => setDetails(event.currentTarget.open)}>
          <summary><Icon name="add" />Add constraints or a start date</summary>
          <div className="oak-brief__wells">{well("constraints")}{well("startDateQuestion")}</div>
        </details>
      </div>
    </section>
    {options.length ? <section className="oak-group oak-brief__references" aria-label="Choose public work references">
      <div className="oak-brief__references-head oak-group__header">
        <h3>Public work references</h3>
        <Badge variant="outline"><RollingNumber value={draft.references.length} /> / 4</Badge>
      </div>
      <div className="oak-group__body">
      {options.map((reference, index) => {
        const key = briefReferenceKey(reference);
        const label = oakBriefCitationLabel(reference, answers, citationLabels, `Public source ${index + 1}`);
        const selected = draft.references.some(value => briefReferenceKey(value) === key);
        // An iOS checkmark row (Settings, Todoist): the whole row toggles the reference; the page opens from its own link.
        return <div key={key} className="oak-brief-reference oak-group__row" data-checked={selected ? "" : undefined}>
          <button type="button" role="checkbox" aria-checked={selected} className="oak-brief-reference__toggle" onClick={() => toggleOakBriefReference(key)}>
            <span className="oak-group__icon" aria-hidden="true"><span className="oak-starter-glyph" data-tone="violet"><Icon name={oakMeaningIcons["field.reference"]} /></span></span>
            <span className="oak-brief-reference__label">{label}</span>
            <span className="oak-brief-reference__check" aria-hidden="true"><Icon name="checkmark" /></span>
          </button>
          <a className="oak-brief-reference__open" href={reference.url} aria-label={`Open ${label}`}><Icon name="arrowUpRight" /></a>
        </div>;
      })}
      </div>
    </section> : null}
    {cleared && !hasContent ? <p className="oak-brief__cleared" role="status">
      <Icon name="retry" size={14} />Brief cleared.
      <Button type="button" variant="ghost" size="sm" onClick={undoStartOver}>Undo</Button>
    </p> : null}
    <Button type="button" variant={draft.text ? "secondary" : "primary"} size="sm" disabled={Boolean(inputError)} onClick={prepareOakContactBrief}>
      <Icon name={oakMeaningIcons["panel.brief-prepare"]} />{draft.text ? "Update brief from these fields" : "Prepare editable brief"}
    </Button>
    {/* The prepared message is a proposal card: the editable brief and a receipt that Oak sent nothing. */}
    {draft.text ? <section ref={proposal} className="oak-brief__message oak-brief__proposal" aria-label="Prepared brief"><Field>
      <FieldLabel htmlFor="oak-brief-text">Review and edit your message</FieldLabel>
      <InputGroup>
        <Textarea variant="bare" rows={8} id="oak-brief-text" value={draft.text} aria-describedby="oak-brief-text-count oak-brief-feedback" onChange={event => setOakContactBriefText(event.target.value)} />
        <InputGroupAddon><FieldCount id="oak-brief-text-count" value={draft.text.length} limit={briefInputLimits.text} /></InputGroupAddon>
      </InputGroup>
    </Field>
      {/* PR 1e: the live region stays mounted so "Email draft opened" is announced; before then it is empty and out of sight. */}
      <div ref={receipt} className={opened ? "oak-brief__sent" : "sr-only"}>
        <p className="oak-brief__sent-line" role="status">{opened ? <React.Fragment key={opens}><Icon name="mailSend" />{opens > 1 ? "Email draft opened again" : "Email draft opened in your mail app"}</React.Fragment> : null}</p>
        {opened ? <span className="oak-brief__sent-actions">
          <Button type="button" variant="ghost" size="sm" onClick={editBrief}><Icon name="pencilEdit" />Edit</Button>
          <Button type="button" variant="ghost" size="sm" onClick={startOver}><Icon name="retry" />Start over</Button>
        </span> : null}
      </div>
      <p className="oak-proposal__receipt oak-brief__receipt"><Icon name="checkmark" />Nothing was sent by Oak. You review it and send it yourself.</p>
    </section> : null}
    <p id="oak-brief-feedback" className="oak-brief__feedback" role="status">{error ?? inputError ?? (draft.text && !draft.needsFormat ? actionError : null) ?? feedback}{!error && !inputError && !feedback && draft.needsFormat && draft.text ? "Update the brief to use your current fields and references." : ""}</p>
    {/* One bottom bar once there is a brief to act on: copy beside the one primary, opening the visitor's own email app with
        the brief filled in. Before that, Prepare is the panel's one action (a disabled Copy under it only pushed off screen). */}
    {draft.text ? <div className="oak-brief-actions">
      {/* PR 1e: what Open email draft will carry, stated before it opens. Shown only when the draft can open at all. */}
      {!actionError ? <p id="oak-brief-summary" className="oak-brief__summary">
        <span>Goes to Steve</span>
        <span>{linkedPages} public {linkedPages === 1 ? "reference" : "references"}</span>
        <span>{draft.text.length.toLocaleString("en-US")} characters</span>
        <span>all editable</span>
      </p> : null}
      <Button type="button" variant="secondary" size="sm" disabled={Boolean(actionError)} onClick={() => void copy()}><Icon name="copy" />Copy brief</Button>
      {/* Ticket 23 (recruiter minor 6): once the draft has opened, the link steps back to a secondary Open again. */}
      {!actionError ? <a className={buttonVariants({ size: "sm", variant: opened ? "secondary" : "primary" })} href={oakBriefMailto(draft)} aria-describedby="oak-brief-summary"
        onClick={() => { setOpens(count => opened ? count + 1 : 1); setOpened(true); }}>
        <Icon name={oakMeaningIcons["panel.brief-send"]} />{opened ? "Open again" : "Open email draft"}</a> : null}
    </div> : null}
  </WorkflowPanel>;
}
