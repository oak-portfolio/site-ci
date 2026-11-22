import * as React from "react";
import { AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { RollingNumber } from "@/components/ui/rolling-number";
import { Icon } from "@/components/ui/Icon";
import { Textarea } from "@/components/ui/textarea";
import { Kbd } from "@/components/ui/kbd";
import { MeterBar, MeterRing } from "@/components/ui/meter";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getOakDocumentsController, oakDocumentName, type OakDocumentsSnapshot } from "@/lib/oakDocumentsWorkspace";
import { getOakWorkspace, isOakDraftReady, OAK_DRAFT_LIMIT, openOakSurface, removeOakQuote, setOakDraft, setOakPageContext, stopOakTurn, submitOakTurn, type OakWorkspaceState } from "@/lib/oakWorkspace";
import { getOakAccountContext } from "@/lib/oakAccountClient";
import { checkingVoiceConfiguration, disabledVoiceConfiguration, voiceServiceAvailable, type VoiceHttpConfiguration } from "@/lib/oakVoiceCapture";
import { cancelOakVoice, configureOakVoice, getOakVoiceController, readOakVoiceConfiguration } from "@/lib/oakVoiceWorkspace";
import { oakComposerPasteOffer, oakEditEarlierOn } from "@/lib/oakChatFlags";
import { oakCounterShown, oakLooksLikeJobPost, oakSplitDocumentFiles, oakTransferFiles, oakTransferHasFiles } from "@/lib/oakComposerInput";
import { oakMeaningIcons } from "@/lib/oakMeaningIcons";
import { oakAllowanceSummary } from "@/lib/oakAllowance";
import { getOakFundingServerState, getOakFundingState, subscribeOakFunding } from "@/lib/oakFundingSession";
import { getOakTurnstileServerState, getOakTurnstileState, subscribeOakTurnstile } from "@/lib/oakTurnstile";
import { OakVerificationNotice } from "./OakTurnstile";
import { OakTaskMenu, type OakSecondaryAction } from "./OakTaskMenu";
import { OakQuoteChip } from "./OakQuoteChip";
import { OakVoiceCapture } from "./OakVoiceCapture";
import { OakOpenRouterMark, oakAskSteveForMore, oakOpenGrantCode, oakUseOpenRouter } from "./OakFundingControl";

/**
 * R10: the newest completed answer's context reading, as a clamped whole percent of the Worker's prompt bound.
 * Null before any answer sends one, so the composer falls back to the memory-only meter.
 */
export function oakContextMeter(messages: OakWorkspaceState["messages"]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.role !== "assistant" || message.state !== "complete") continue;
    const reading = message.context;
    if (!reading || !(reading.limitBytes > 0)) return null;
    return { ...reading, percent: Math.min(100, Math.max(0, Math.round(reading.conversationBytes / reading.limitBytes * 100))) };
  }
  return null;
}
const countFormat = new Intl.NumberFormat("en-US");

/** The page's own name for the page chip: the title up to its site suffix. */
const pageTitleOf = (title: string) => title.split(/\s[|\u00b7\u2013\u2014-]\s/)[0]?.trim() || "This page";

export type OakMeterTone = "normal" | "low" | "out";
const toneRank: Record<OakMeterTone, number> = { normal: 0, low: 1, out: 2 };
/**
 * R17: the composer's one meter. Answers are low at a quarter of the allowance or less and out at none; memory is low at
 * 75% full and out at 90%. The ring leads with answers unless memory is in a worse state, or there is no allowance (the
 * visitor's own account). The ring draws what its number says: answers left, or memory full (R17 review).
 */
export function oakComposerMeter(allowance: { remaining: number; limit: number } | null, memoryPercent: number | null) {
  if (!allowance && memoryPercent === null) return null;
  const answers: OakMeterTone = !allowance ? "normal" : allowance.remaining <= 0 ? "out"
    : allowance.remaining <= Math.max(1, Math.ceil(allowance.limit / 4)) ? "low" : "normal";
  const memory: OakMeterTone = memoryPercent === null ? "normal" : memoryPercent >= 90 ? "out" : memoryPercent >= 75 ? "low" : "normal";
  const lead = !allowance || (memoryPercent !== null && toneRank[memory] > toneRank[answers]) ? "memory" as const : "answers" as const;
  return lead === "answers"
    ? { lead, tone: answers, answers, memory, value: Math.max(0, allowance!.remaining), of: allowance!.limit }
    : { lead, tone: memory, answers, memory, value: memoryPercent!, of: 100 };
}

export function OakComposer({ state, documents, composerId, composerRef, intake, standby = false, actionBar: panelAction, menuContainer,
  toolsOpen, onToolsOpenChange, onSelectTool, onEscape, context, onFiles,
}: {
  /** v3 review: how much of the conversation Oak still remembers, shown beside the answers-left ring. */
  context?: { used: number; limit: number };
  state: OakWorkspaceState;
  documents: OakDocumentsSnapshot;
  composerId: string;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  intake: boolean;
  /** A panel with its own actions (brief, funding, documents, voice, saved conversations, sign-in) owns the whole window; the message box waits, still mounted, under it. */
  standby?: boolean;
  /** The open panel owns the fields (role, question, advice), so the footer is a bottom bar with one full-width primary. */
  actionBar?: boolean;
  menuContainer?: React.RefObject<HTMLDivElement | null>;
  toolsOpen: boolean;
  onToolsOpenChange: (open: boolean) => void;
  onSelectTool: (action: OakSecondaryAction) => void;
  onEscape: (event: React.KeyboardEvent) => void;
  /** PR 1d: where a pasted or dropped file goes. Defaults to the paperclip's path: Private documents, staged, never sent here. */
  onFiles?: (files: File[]) => void;
}) {
  // P03-G1: a guest proves once, before the first sponsored answer, that a person is here.
  const turnstile = React.useSyncExternalStore(subscribeOakTurnstile, getOakTurnstileState, getOakTurnstileServerState);
  const turnstileKey = state.authStatus?.kind === "guest" && !turnstile.passed && (!state.authStatus.humanPassed || turnstile.refused) ? state.authStatus.turnstileSiteKey : undefined;
  const disabled = !isOakDraftReady(state) || state.historyLifecycle.phase !== "idle" || state.historyPending || state.authPending || state.authReauthenticate || state.authStatus?.phase === "sign-in-required" || state.authStatus?.phase === "continue-required" || Boolean(turnstileKey && !turnstile.token);
  const controlsAvailable = !intake && !state.pending && !state.historyPending && !state.authPending;
  // Oak's answers-left ring speaks for sponsored answers only; with the visitor's own account selected it steps aside (D150).
  const funding = React.useSyncExternalStore(subscribeOakFunding, getOakFundingState, getOakFundingServerState);
  const allowance = funding.selected === "sponsored" ? oakAllowanceSummary(state.authStatus) : null;
  const usage = React.useRef<{ close: () => void; unmount: () => void }>(null);
  const meterButton = React.useRef<HTMLButtonElement>(null);
  const usageOpen = React.useRef(false);
  // Base UI closes the popover on Escape before the form sees the key; that same Escape must not also close the workspace.
  const usageEscape = React.useRef<Event | null>(null);
  const windowMeter = oakContextMeter(state.messages);
  // R11 (Oak): one conversation-memory reading. Two limits can fill: the last 12 messages Oak keeps, and the text budget
  // each answer's prompt fits in. The meter shows whichever is fuller, and the card names both totals and the model's own
  // window, so "12 messages" and "context window" stop reading as two unrelated meters.
  const messagePercent = context ? Math.min(100, Math.round(context.used / context.limit * 100)) : 0;
  const memoryPercent = Math.max(windowMeter?.percent ?? 0, messagePercent);
  const tokensOf = (bytes: number) => countFormat.format(Math.round(bytes / 4));
  const windowLabel = [`Conversation memory: ${memoryPercent}% full`,
    ...(context ? [`${context.used} of ${context.limit} messages kept`] : []),
    ...(windowMeter ? [`about ${tokensOf(windowMeter.conversationBytes)} of ${tokensOf(windowMeter.limitBytes)} tokens of text`] : [])].join(", ");
  const memoryShown = Boolean(windowMeter || context?.used) && !intake;
  const meter = oakComposerMeter(allowance, memoryShown ? memoryPercent : null);
  // R17 review: the name says low or out in words, so the tone never rests on colour alone.
  const toneWords = !meter || meter.tone === "normal" ? "" : meter.lead === "answers"
    ? meter.tone === "out" ? " No answers left." : " Running low on answers."
    : meter.tone === "out" ? " Conversation memory is full." : " Conversation memory is almost full.";
  const meterLabel = `${allowance ? `Answers left: ${allowance.detail}${memoryShown ? ` ${windowLabel}.` : ""}` : windowLabel}${toneWords}`;
  const cardTitle = allowance && memoryShown ? "Answers left and conversation memory" : allowance ? "Answers left" : "Conversation memory";
  const actionBar = panelAction ?? Boolean(state.roleDraft);
  const primaryLabel = state.roleDraft ? "Compare" : "Send";
  // PR 1d: page chip, character counter, paste offer, paste and drop of files, inline dictation.
  const [pageTitle, setPageTitle] = React.useState("This page");
  React.useEffect(() => { setPageTitle(pageTitleOf(document.title)); }, [state.route, state.sourceIds.length]);
  const pageChip = !actionBar && state.sourceIds.length > 0;
  const counted = !actionBar && oakCounterShown(state.draft.length, OAK_DRAFT_LIMIT);
  const over = state.draft.length - OAK_DRAFT_LIMIT;
  const [offer, setOffer] = React.useState(false);
  React.useEffect(() => { if (!state.draft.trim()) setOffer(false); }, [state.draft]);
  const offerShown = oakComposerPasteOffer && offer && !actionBar && !state.pending && state.draftKind === "question" && Boolean(state.draft.trim());
  const [dictating, setDictating] = React.useState(false);
  const micRef = React.useRef<HTMLButtonElement>(null);
  // An open Tools menu or usage card keeps Escape: the strip collapses only when nothing else is open above it.
  const toolsOpenRef = React.useRef(toolsOpen);
  toolsOpenRef.current = toolsOpen;
  React.useEffect(() => { if (dictating && !controlsAvailable) setDictating(false); }, [dictating, controlsAvailable]);
  // Escape collapses the dictation strip and hands focus back to the mic button, with the chat left open. The listener is
  // native and in the capture phase on the document: Record disables itself while the microphone runs, which drops focus
  // out of the form, and the dialog would otherwise hear that Escape first and close the chat.
  React.useEffect(() => {
    if (!dictating) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || toolsOpenRef.current || usageOpen.current || inOtherLayer(event.target) || inOtherLayer(document.activeElement)) return;
      event.preventDefault(); event.stopPropagation();
      setDictating(false);
      // After the strip's own teardown settles, so nothing it unmounts hands focus back to the dialog.
      requestAnimationFrame(() => micRef.current?.focus({ preventScroll: true }));
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [dictating]);
  const [dropping, setDropping] = React.useState(false);
  const [fileNote, setFileNote] = React.useState<string | null>(null);
  // The same road as the paperclip: open Private documents and stage the files there. Preparing them (upload, scan quota,
  // the quick check) is the panel's own explicit step, so nothing is uploaded and the chat request gains no file.
  const takeFiles = (files: File[]) => {
    if (!controlsAvailable || actionBar) return;
    const { files: readable, skipped } = oakSplitDocumentFiles(files);
    setFileNote(skipped ? readable.length ? "Oak reads up to 3 TXT, DOCX or PDF files. The rest were left out." : "Oak reads TXT, DOCX or PDF files. Paste the text for other formats." : null);
    if (!readable.length) return;
    if (onFiles) { onFiles(readable); return; }
    openOakSurface("documents");
    const conversationId = getOakWorkspace().conversationId;
    if (conversationId) getOakDocumentsController().stageFiles(readable, { conversationId, accountEpoch: getOakAccountContext().epoch });
  };
  // While an answer runs, Escape stops it instead of closing the workspace.
  const onKeyDownCapture = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && state.pending) { event.preventDefault(); event.stopPropagation(); stopOakTurn(); return; }
    // Escape with the usage card open closes only the card, as the workspace does for its menus.
    if (event.key === "Escape" && (usageOpen.current || usageEscape.current === event.nativeEvent)) {
      event.preventDefault(); event.stopPropagation(); usageEscape.current = null; usage.current?.close();
      setTimeout(() => meterButton.current?.focus({ preventScroll: true }), 120); return;
    }
    // Escape collapses the dictation strip or the paste offer, hands focus back to what opened it, and leaves the chat open.
    if (event.key === "Escape" && offerShown) { event.preventDefault(); event.stopPropagation(); setOffer(false); composerRef.current?.focus(); return; }
    onEscape(event);
  };
  // A file dragged over the box is always kept from navigating the tab away; it is staged only when the box can take it.
  const onDragOver = (event: React.DragEvent) => { if (!actionBar && oakTransferHasFiles(event.dataTransfer)) { event.preventDefault(); setDropping(controlsAvailable); } };
  const onDragLeave = (event: React.DragEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false); };
  const onDrop = (event: React.DragEvent) => {
    if (actionBar || !oakTransferHasFiles(event.dataTransfer)) return;
    event.preventDefault(); setDropping(false); takeFiles(oakTransferFiles(event.dataTransfer));
  };
  // What a disabled Send is waiting for: its tooltip for the eye, and its description for a screen reader (M5 K5).
  const sendReason = !disabled ? null : turnstileKey && !turnstile.token && isOakDraftReady(state)
    ? turnstile.failed ? "Retry the quick check to send" : "Finishing a quick check"
    : state.roleDraft ? "Add the role description first" : state.questionDraft ? "Fill in both fields first"
    : over > 0 ? `Shorten your message by ${countFormat.format(over)} ${over === 1 ? "character" : "characters"} to send` : "Type a question to send";
  return <form id={composerId} className="oak-composer" data-standby={standby || undefined} inert={standby || undefined} onKeyDownCapture={onKeyDownCapture} onSubmit={event => {
    event.preventDefault();
    if (!state.pending && !disabled) void submitOakTurn();
  }}>
    {/* A panel that brings its own fields gets a bottom bar with one full-width primary, not an empty message box. */}
    <div className="oak-composer__surface" data-action-bar={actionBar ? "" : undefined} data-working={state.pending && !actionBar ? "" : undefined}
      data-drop={dropping ? "" : undefined} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {/* PR 1d: the page this question is asked from. Remove it and the next question goes out without that page's context. */}
      {pageChip ? <div role="group" aria-label="Page context" className="oak-composer__page">
        {state.pageContextOff ? <Button type="button" variant="ghost" size="sm" onClick={() => { setOakPageContext(true); composerRef.current?.focus(); }}>
          <Icon name="globe" size={14} /><span>Add this page back</span></Button>
        : <span className="oak-quote-chip oak-page-chip" data-removable="" data-kind="page">
          <Icon name="globe" size={14} />
          <span className="oak-quote-chip__text" title={pageTitle}>{pageTitle}</span>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon" />} type="button" aria-label={`Remove page context, ${pageTitle}`}
              onClick={() => { setOakPageContext(false); composerRef.current?.focus(); }}>
              <Icon name="cancel" size={14} />
            </TooltipTrigger>
            <TooltipContent positionerClassName="oak-composer__tooltip">Remove page context</TooltipContent>
          </Tooltip>
        </span>}
      </div> : null}
      {/* D123: phrases staged by Ask about this, sent with the next message. Empty, the row hides; exits still finish. */}
      {!actionBar ? <div role="group" aria-label="Quoted from Oak's answer" className="oak-composer__quotes">
        <AnimatePresence mode="popLayout" initial={false}>
          {state.quotes.map(quote => <OakQuoteChip key={quote.id} text={quote.text} source={quote.source} onRemove={() => { removeOakQuote(quote.id); composerRef.current?.focus(); }} />)}
        </AnimatePresence>
      </div> : null}
      {/* The sections Oak reads with the next answer, as attachment chips; each reopens the selection to review it. */}
      {documents.usedSelections.length ? <div className="oak-composer__attachments" aria-label="Document sections for your next answer">
        {/* v3 review: one chip per document, by its file name and how many parts it brings. */}
        {[...new Set(documents.usedSelections.map(span => span.documentId))].map(documentId => {
          const parts = documents.usedSelections.filter(span => span.documentId === documentId).length;
          const name = `${oakDocumentName(documents, documentId)} · ${parts} ${parts === 1 ? "part" : "parts"}`;
          return <Tooltip key={documentId}>
            <TooltipTrigger render={<Button variant="ghost" size="sm" />} type="button" aria-label={`${name}, review selection`} onClick={() => openOakSurface("documents")}>
              <Icon name="bookOpenText" /><span>{name}</span>
            </TooltipTrigger>
            <TooltipContent positionerClassName="oak-composer__tooltip">Review selection</TooltipContent>
          </Tooltip>;
        })}
        {/* Q18 F4: the sections stay for follow-ups, so the visitor can stop using them from here, not only in Documents. */}
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" />} type="button" aria-label="Stop using these document sections"
            onClick={() => { getOakDocumentsController().clearUse(); composerRef.current?.focus(); }}>
            <Icon name="cancel" size={14} />
          </TooltipTrigger>
          <TooltipContent positionerClassName="oak-composer__tooltip">Stop using these sections</TooltipContent>
        </Tooltip>
      </div> : null}
      {!actionBar ? <div className="oak-composer__field">
        <Textarea ref={composerRef} variant="bare" rows={1} id="oak-composer-input"
          aria-label={state.draftKind === "advice" ? "Your project advice question" : "Message Oak AI Agent"}
          value={state.draft} onChange={event => { setOakDraft(event.target.value); if (fileNote) setFileNote(null); }}
          aria-describedby={counted ? "oak-composer-count" : undefined}
          onPaste={event => {
            const files = oakTransferFiles(event.clipboardData), text = event.clipboardData.getData("text/plain");
            // Text copied from Word, Excel or Numbers also carries a picture of itself; with text on the clipboard, the text pastes.
            if (files.length && !text) { event.preventDefault(); takeFiles(files); return; }
            setOffer(oakComposerPasteOffer && oakLooksLikeJobPost(text));
          }}
          onKeyDown={event => {
            // Backspace in an empty box takes back the last quote, as in a token field.
            if (event.key === "Backspace" && !event.currentTarget.value && state.quotes.length) { event.preventDefault(); removeOakQuote(state.quotes.at(-1)!.id); return; }
            // SH22: with Edit on earlier questions on, ArrowUp in an empty box brings the last question back to edit.
            if (event.key === "ArrowUp" && !event.currentTarget.value && !state.quotes.length && !state.pending) {
              // The same questions Edit offers (OakTurn's oakEarlierEditable): plain questions, never a role, advice or private document turn.
              const last = state.messages.findLast(message => message.role === "user");
              if (oakEditEarlierOn() && last && !last.privateDocumentTurn && (!last.taskKind || last.taskKind === "question")) {
                event.preventDefault(); setOakDraft(last.quoted ? last.quoted.text : last.text); return;
              }
            }
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
            event.preventDefault();
            if (!state.pending && !disabled) event.currentTarget.form?.requestSubmit();
          }} placeholder={state.draftKind === "advice" ? "What decision would you like advice on?" : "Ask about Steve's work"} enterKeyHint="send" />
      </div> : null}
      {/* PR 1d: from 80 percent of the cap. Past it (SH15) nothing is cut: the counter names the overflow and Send waits. */}
      {counted ? <p id="oak-composer-count" className="oak-composer__count" data-state={over > 0 ? "over" : over === 0 ? "limit" : "near"}>
        {over > 0 ? <Icon name="alert" size={14} /> : null}
        {countFormat.format(state.draft.length)} / {countFormat.format(OAK_DRAFT_LIMIT)}{over > 0 ? `, ${countFormat.format(over)} over` : null}</p> : null}
      {offerShown ? <div role="group" aria-label="Compare a role offer" className="oak-composer__offer">
        <Icon name={oakMeaningIcons["field.role"]} size={16} />
        <span>That looks like a job post.</span>
        <Button type="button" variant="secondary" size="sm" onClick={() => { setOffer(false); openOakSurface("role"); }}><Icon name="compare" />Compare a role</Button>
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" />} type="button" aria-label="Dismiss this offer" onClick={() => { setOffer(false); composerRef.current?.focus(); }}>
            <Icon name="cancel" size={14} />
          </TooltipTrigger>
          <TooltipContent positionerClassName="oak-composer__tooltip">Dismiss</TooltipContent>
        </Tooltip>
      </div> : null}
      {dictating && controlsAvailable ? <OakComposerDictation onClose={() => { setDictating(false); micRef.current?.focus(); }}
        onReview={() => { setDictating(false); openOakSurface("voice"); }}
        onUseText={text => {
          const draft = getOakWorkspace().draft;
          setOakDraft(draft.trim() ? `${draft.trimEnd()} ${text}` : text);
          setDictating(false); composerRef.current?.focus();
        }} /> : null}
      <div className="oak-composer__actions">
        {controlsAvailable ? <>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon" />} type="button" aria-label="Attach documents" onClick={() => openOakSurface("documents")}><Icon name="attachment" /></TooltipTrigger>
            <TooltipContent positionerClassName="oak-composer__tooltip">Attach documents</TooltipContent>
          </Tooltip>
          <OakTaskMenu container={menuContainer} open={toolsOpen} onOpenChange={onToolsOpenChange} onSelect={onSelectTool} />
          <Tooltip>
            <TooltipTrigger ref={micRef} render={<Button variant="ghost" size="icon" />} type="button" aria-label="Dictate a message" aria-expanded={dictating} aria-controls={dictating ? "oak-composer-dictation" : undefined}
              onClick={() => setDictating(open => !open)}><Icon name="microphone" /></TooltipTrigger>
            <TooltipContent positionerClassName="oak-composer__tooltip">Dictate</TooltipContent>
          </Tooltip>
        </> : null}
        {/* R17 (Oak, steveoak.com: "merge the meter circles into one and show states"): one ring at the right beside Send.
            It reads answers left, or conversation memory once memory is the more pressing of the two; its tone says normal,
            low or out. Hover previews and a click pins one card holding both readings (Gamma's balance popover). */}
        {meter ? <div className="oak-composer__meters"><Popover actionsRef={usage} onOpenChange={(open, details) => {
          usageOpen.current = open;
          usageEscape.current = !open && details.reason === "escape-key" ? details.event : null;
          if (!open && details.reason === "escape-key") setTimeout(() => meterButton.current?.focus({ preventScroll: true }), 120);
        }}>
          {/* The button's name carries both exact readings, so the ring and its number are visual only. */}
          <PopoverTrigger openOnHover delay={150} closeDelay={150} render={<button ref={meterButton} type="button" className="oak-composer__meter"
            data-lead={meter.lead} data-tone={meter.tone} aria-label={meterLabel} />}>
            <MeterRing value={meter.value} max={meter.of} aria-hidden="true" />
            <span aria-hidden="true" className="oak-composer__meter-value">{meter.lead === "answers" && allowance
              ? <RollingNumber value={allowance.remaining} />
              // R17 review: a memory reading wears the memory glyph, so "92%" never reads as an answers count.
              : <><Icon name="thought" size={12} />{`${memoryPercent}%`}</>}</span>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" container={menuContainer} className="oak-usage-card"
            finalFocus={closeType => closeType === "keyboard" ? meterButton.current : false}>
            <PopoverTitle render={<p className="sr-only" />}>{cardTitle}</PopoverTitle>
            {/* Answers first: the count, when the next one comes back, the three ways to keep going (each opens its flow). */}
            {allowance ? <section className="oak-usage-card__section" data-tone={meter.answers} aria-label="Answers left">
              <p className="oak-usage-card__count"><strong>{allowance.remaining}</strong><span>{allowance.label}</span></p>
              <MeterBar value={allowance.remaining} max={allowance.limit} aria-hidden="true" />
              <p className="oak-usage-card__detail"><Icon name="clock" size={14} />{allowance.reset}</p>
              <div className="oak-usage-card__actions" role="group" aria-label="Get more answers">
                <Button type="button" variant="ghost" size="sm" onClick={() => { usage.current?.close(); oakAskSteveForMore(); }}><Icon name="mail" />Ask Steve for more</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => { usage.current?.close(); oakOpenGrantCode(); }}><Icon name="gift" />Have a grant code</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => { usage.current?.close(); oakUseOpenRouter(state.pending ? stopOakTurn : undefined); }}><OakOpenRouterMark size={16} />Use my OpenRouter account</Button>
              </div>
            </section> : null}
            {memoryShown ? <section className="oak-usage-card__section" data-context="" data-tone={meter.memory} aria-label="Conversation memory">
            <p className="oak-context-card__title">Conversation memory</p>
            <p className="oak-usage-card__count"><strong>{memoryPercent}%</strong><span>full</span></p>
            <MeterBar value={memoryPercent} max={100} aria-hidden="true" />
            {context ? <p className="oak-usage-card__detail"><Icon name="thought" size={14} />{context.used} of {context.limit} messages kept</p> : null}
            {windowMeter ? <p className="oak-usage-card__detail"><Icon name="transfer" size={14} />
              About {tokensOf(windowMeter.conversationBytes)} of {tokensOf(windowMeter.limitBytes)} tokens of text</p> : null}
            <p className="oak-usage-card__detail oak-context-card__note">The model can read far more. Oak sends at most about {tokensOf(windowMeter?.limitBytes ?? 15_360)} per
              answer, so it stays fast and free. Past {context?.limit ?? 12} messages the oldest drop out; when the text fills, start a new chat.</p>
            </section> : null}
          </PopoverContent>
        </Popover></div> : null}
        {/* Each button renders its tooltip trigger, so Stop and Send stay distinct keyed elements. */}
        {state.pending ? <Tooltip key="stop-tip">
          <Button key="stop-turn" render={<TooltipTrigger />} type="button" variant="secondary" size="icon" aria-label="Stop" aria-keyshortcuts="Escape" onClick={event => { event.preventDefault(); stopOakTurn(); }}>
            <Icon name="stop" size={16} /><span className="sr-only">Stop</span>
          </Button>
          <TooltipContent positionerClassName="oak-composer__tooltip">Stop answer<Kbd>Esc</Kbd></TooltipContent>
        </Tooltip> : <Tooltip key="send-tip">
          {/* Focusable while disabled, so hover and focus still explain what Send is waiting for. */}
          <Button key="send-turn" render={<TooltipTrigger />} type="submit" size={actionBar ? "md" : "icon"} disabled={disabled} focusableWhenDisabled aria-label={primaryLabel} aria-keyshortcuts="Enter"
            aria-describedby={sendReason ? "oak-composer-send-reason" : undefined}>
            {/* In the bottom bar the primary keeps a visible word. */}
            <span className={actionBar ? undefined : "sr-only"}>{primaryLabel}</span><Icon name="send" size={16} />
          </Button>
          <TooltipContent positionerClassName="oak-composer__tooltip">{sendReason ?? <>{state.roleDraft ? "Compare role" : "Send message"}<Kbd>Enter</Kbd></>}</TooltipContent>
        </Tooltip>}
        {sendReason ? <span id="oak-composer-send-reason" className="sr-only">{sendReason}</span> : null}
      </div>
    </div>
    <OakVerificationNotice turnstileKey={turnstileKey} turnstile={turnstile} />
    {state.historyPending ? <p className="oak-composer__note">Wait for saved history to finish loading before sending.</p> : null}
    {fileNote ? <p className="oak-composer__note" role="status">{fileNote}</p> : null}
  </form>;
}

/**
 * True when focus sits inside a menu, popover, sheet or drawer other than the agent dialog itself. Those layers own their
 * Escape, so the dictation strip leaves the key alone while one is open.
 */
const inOtherLayer = (node: EventTarget | null) => {
  const layer = node instanceof Element ? node.closest("[role='menu'], [role='dialog'], [role='listbox'], .oak-other-ways") : null;
  return Boolean(layer && !layer.classList.contains("oak-workspace"));
};

const statusReadTimeoutMs = 5000;
const statusRefreshMs = 30_000;

/**
 * Inline dictation (PR 1d). The same capture the Dictate panel runs (OakVoiceCapture, its permission flow, its limits), opened
 * from the mic button inside the composer. Opening only reads the public service status; the microphone starts when the
 * visitor presses Record, and the words land in the box to edit. Nothing here sends.
 */
function OakComposerDictation({ onUseText, onReview, onClose }: { onUseText: (text: string) => void; onReview: () => void; onClose: () => void }) {
  const [configuration, setConfiguration] = React.useState<VoiceHttpConfiguration>(checkingVoiceConfiguration);
  const controller = getOakVoiceController();
  const hasTranscript = React.useSyncExternalStore(controller.subscribe, () => controller.getSnapshot().transcript.trim().length > 0, () => false);
  React.useEffect(() => {
    let stopped = false, reading: AbortController | null = null;
    const read = async (first: boolean) => {
      if (reading) return;
      const request = reading = new AbortController();
      const timer = setTimeout(() => request.abort(), statusReadTimeoutMs);
      try {
        const next = await readOakVoiceConfiguration(request.signal);
        if (stopped || request.signal.aborted) { if (first && !stopped) setConfiguration(disabledVoiceConfiguration); return; }
        configureOakVoice(next); setConfiguration(next);
      } catch {
        // A missed refresh keeps the last status; a failed first read settles to off instead of checking forever.
        if (first && !stopped) setConfiguration(disabledVoiceConfiguration);
      } finally { clearTimeout(timer); if (reading === request) reading = null; }
    };
    void read(true);
    const interval = setInterval(() => { void read(false); }, statusRefreshMs);
    return () => { stopped = true; clearInterval(interval); reading?.abort(); cancelOakVoice(); };
  }, []);
  const available = voiceServiceAvailable(configuration);
  const checking = !available && configuration.checking === true;
  return <section id="oak-composer-dictation" className="oak-composer__dictation" aria-label="Dictation" data-state={checking ? "checking" : available ? "ready" : "off"}>
    {available ? <OakVoiceCapture configuration={configuration} controller={controller} onUseTranscript={text => { controller.clear(); onUseText(text); }} />
      : checking ? <p className="oak-voice__checking" role="status">Checking that dictation is on</p>
      : <div className="oak-composer__dictation-off" role="note">
        <Icon name="microphoneOff" />
        <p><strong>Voice input is off right now</strong><span>Dictation is switched off on this site. Typing works the same way.</span></p>
      </div>}
    <div className="oak-composer__dictation-actions">
      {/* The Dictate panel is the roomier review step: it opens with the transcript already in it. */}
      {available && hasTranscript ? <Button type="button" variant="ghost" size="sm" onClick={onReview}><Icon name="maximize" size={14} />Review in full</Button> : null}
      <Button type="button" variant="ghost" size="sm" onClick={onClose}><Icon name="cancel" size={14} />Close dictation</Button>
    </div>
  </section>;
}
