import * as React from "react";
import { Field, FieldCount, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { OakContactBriefEditor } from "./OakContactBriefEditor";
import type { OakSecondaryAction } from "./OakTaskMenu";
import { OakComposer } from "./OakComposer";
import { OakAccountContinuation } from "./OakAccountContinuation";
import { OakDocumentsPanel } from "./OakDocumentsPanel";
import { OakOutputAnnouncements, OakTranscript } from "./OakTranscript";
import { OakEmptyState, oakStarters } from "./OakEmptyState";
import { OakWelcomePresence } from "./OakWelcomePresence";
import { OakSelectionActions } from "./OakSelectionActions";
import { OakVerification, useOakVerification } from "./OakTurnstile";
import { OakAdvicePanel, OakConversationPanel, OakFundingPanel, OakQuestionDraftPanel, OakRoleExamples, OakVoicePanel } from "./OakWorkflowPanels";
import { WorkflowPanel } from "./WorkflowPanel";
import { useOakDocumentsWorkspace } from "@/lib/oakDocumentsWorkspace";
import { getOakAccountContext } from "@/lib/oakAccountClient";
import { oakAllowanceSummary } from "@/lib/oakAllowance";
import type { OakCitationLabels } from "@/lib/oakCitationLabels";
import { oakMeaningIcons } from "@/lib/oakMeaningIcons";
import { oakComposerSuggestions } from "@/lib/oakSuggestions";
import { oakContextWindow } from "@/lib/oakSavedHistoryClient";
import { roleDescriptionMaxBytes } from "../../../packages/oak-agent-contracts/src/transport";
import {
  askOakSuggestion, closeOakSurface, getOakBriefReferences, oakRoleDraftError, oakSurface, oakTurnNotices, openOakDocuments, openOakSurface,
  saveOakCurrentConversationWithDocuments, setOakRoleDraftInput, useOakVoiceTranscript,
  type OakSurface, type OakWorkspaceState,
} from "@/lib/oakWorkspace";
export { clearOakTranscriptPosition, collectOakOutputAnnouncements, oakOutputUnitKeys } from "./OakTranscript";

const panelOpeners: Partial<Record<OakSurface, string>> = { documents: 'button[aria-label="Attach documents"]', role: "[data-oak-tools-trigger]" };
const toolSurfaces: Record<OakSecondaryAction, Exclude<OakSurface, "chat">> = {
  documents: "documents", role: "role", advice: "advice", brief: "brief", voice: "voice", history: "conversation", funding: "funding",
};

/** A realistic post to try the comparison with, so a visitor without one at hand can still see how it works (D120). */
const oakSampleRole = `Senior Design Engineer, AI products

We are a small product team building AI features into a design and planning tool. You will sit between design and engineering.

What you will do
- Prototype and ship agent and chat experiences in React and TypeScript, from first sketch to production
- Own our design system in code: tokens, components, motion and accessibility
- Work with product and ML engineers on evaluation loops, so we can see when an AI feature gets better or worse
- Turn research and user feedback into clear interface decisions

What we look for
- 5+ years building product interfaces, with work you can show
- Strong frontend craft: React, CSS, animation and performance
- Experience shipping LLM features (tool calls, retrieval, streaming UI)
- Comfortable owning a problem end to end on a small team`;

/**
 * Review v4: the welcome and the panels used to stop dead at the composer. The reading pane and the welcome's viewport
 * mark `data-more-below` while there is more under the fold, so CSS fades their bottom edge into the composer the way the
 * transcript's own viewport does through the scroller's data-scrollable.
 */
function useOakMoreBelow(pane: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const node = pane.current;
    if (!node) return;
    // The welcome scrolls in its own viewport (the transcript's viewport marks itself), so both get the mark.
    const mark = (el: HTMLElement) => el.toggleAttribute("data-more-below", el.scrollHeight - el.scrollTop - el.clientHeight > 1);
    const update = () => {
      mark(node);
      node.querySelectorAll<HTMLElement>(".oak-conversation[data-empty=\"true\"] > .oak-conversation__viewport").forEach(mark);
    };
    update();
    // Scroll does not bubble, so one capturing listener hears the pane and any viewport inside it.
    node.addEventListener("scroll", update, { passive: true, capture: true });
    const resize = new ResizeObserver(update);
    resize.observe(node);
    const content = new MutationObserver(update);
    content.observe(node, { childList: true, subtree: true });
    return () => { node.removeEventListener("scroll", update, { capture: true }); resize.disconnect(); content.disconnect(); };
  }, [pane]);
}

export function OakConversation({
  state, onContact, geometryKey, citationLabels, menuContainer,
  toolsOpen = false, onToolsOpenChange = () => {}, conversationResetVersion = 0,
}: {
  state: OakWorkspaceState;
  onContact: () => void;
  geometryKey: string;
  citationLabels?: OakCitationLabels;
  menuContainer?: React.RefObject<HTMLDivElement | null>;
  toolsOpen?: boolean;
  onToolsOpenChange?: (open: boolean) => void;
  conversationResetVersion?: number;
}) {
  const composerId = React.useId();
  const documents = useOakDocumentsWorkspace();
  const reading = React.useRef<HTMLDivElement | null>(null);
  const composer = React.useRef<HTMLTextAreaElement | null>(null);
  useOakMoreBelow(reading);
  const conversationKey = state.conversationId ? `${state.conversationId}:${state.historyRevision}` : "empty";
  const restoreComposerFocus = React.useRef(false);
  const previousConversationReset = React.useRef(conversationResetVersion);
  const previousHistoryRevision = React.useRef(state.historyRevision);
  const surface = oakSurface(state, Boolean(documents.open));
  const accountNeedsAttention = Boolean(state.authOpen || state.authReauthenticate || state.authError ||
    state.authStatus?.phase === "sign-in-required" || state.authStatus?.phase === "continue-required");
  // Advice types into the main composer, so focus handling treats it like chat (composerPanel). Its intake still hides the
  // transcript like every other panel (Q18 F2: the last answer's action row sat above the Project advice header); sending
  // resets draftKind to question, so the streaming advice answer shows in the transcript as usual.
  const composerPanel = surface !== "chat" && surface !== "advice";
  const transcriptHidden = surface !== "chat";
  const intake = surface !== "chat" || accountNeedsAttention;
  // R11: a guest's Turnstile check that needs the visitor takes the conversation area (verification mode) until it passes.
  // Every surface that sends through the message box (chat, role, advice, question) can show it; a panel that holds the
  // composer in standby keeps the window and the check waits (R11 review: keying this on intake left role and advice stuck).
  const standbySurface = ["brief", "funding", "documents", "voice", "conversation", "account"].includes(surface);
  const verification = useOakVerification(state.authStatus, standbySurface);
  const verifying = verification.verifying;
  // R11 review: after a pass the heading unmounts, so focus returns to the message box rather than the page body.
  const wasVerifying = React.useRef(false);
  React.useEffect(() => {
    if (wasVerifying.current && !verifying) requestAnimationFrame(() => composer.current?.focus({ preventScroll: true }));
    wasVerifying.current = verifying;
  }, [verifying]);
  const cancelVerification = () => {
    verification.dismiss();
    requestAnimationFrame(() => composer.current?.focus({ preventScroll: true }));
  };
  React.useLayoutEffect(() => {
    const pane = reading.current;
    const view = pane?.ownerDocument.defaultView;
    if (state.presentation !== "human-agent" || !intake || !pane || !view) return;
    const visible = view.visualViewport;
    let alive = true;
    let frame: number | null = null;
    let focusChanged = false;
    const geometry = () => {
      const rect = pane.getBoundingClientRect();
      return [rect.top, rect.left, rect.width, rect.height, pane.clientTop, pane.clientHeight,
        pane.clientWidth, visible?.width, visible?.height, visible?.offsetTop, visible?.offsetLeft, visible?.scale].join(":");
    };
    let previousGeometry = geometry();
    const schedule = (fromFocus = false) => {
      if (!alive) return;
      focusChanged ||= fromFocus;
      if (frame !== null) return;
      frame = view.requestAnimationFrame(() => {
        frame = null;
        if (!alive || !pane.isConnected) return;
        const nextGeometry = geometry();
        const shouldReveal = focusChanged || nextGeometry !== previousGeometry;
        focusChanged = false;
        previousGeometry = nextGeometry;
        if (!shouldReveal) return;
        const field = pane.ownerDocument.activeElement;
        if (!field?.isConnected || !pane.contains(field) || !field.matches("input, textarea")) return;
        const fieldRect = field.getBoundingClientRect();
        if (fieldRect.height <= 0 || pane.clientHeight <= 0) return;
        const top = pane.getBoundingClientRect().top + pane.clientTop;
        // v3 review: a revealed field keeps the pane's bottom scroll padding (a full step) above the footer bar, so its
        // frame and focus glow never sit cut off against the footer.
        const gap = Number.parseFloat(view.getComputedStyle?.(pane).scrollPaddingBlockEnd ?? "") || 0;
        const bottom = top + pane.clientHeight - Math.min(gap, Math.max(0, pane.clientHeight - fieldRect.height));
        // Only this scrollport moves. Native focus, selection and the fixed
        // footer remain untouched; a taller-than-pane field starts at its top.
        const delta = fieldRect.top < top || fieldRect.height > pane.clientHeight ? fieldRect.top - top :
          fieldRect.bottom > bottom ? fieldRect.bottom - bottom : 0;
        if (delta) pane.scrollTop += delta;
      });
    };
    const onFocus = () => schedule(true);
    const onGeometry = () => schedule();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onGeometry);
    observer?.observe(pane);
    pane.addEventListener("focusin", onFocus);
    view.addEventListener("resize", onGeometry);
    view.addEventListener("orientationchange", onGeometry);
    visible?.addEventListener("resize", onGeometry);
    visible?.addEventListener("scroll", onGeometry);
    schedule(true);
    return () => {
      alive = false;
      if (frame !== null) view.cancelAnimationFrame(frame);
      observer?.disconnect();
      pane.removeEventListener("focusin", onFocus);
      view.removeEventListener("resize", onGeometry);
      view.removeEventListener("orientationchange", onGeometry);
      visible?.removeEventListener("resize", onGeometry);
      visible?.removeEventListener("scroll", onGeometry);
    };
  }, [state.presentation, intake]);
  const memory = state.messages.length ? oakContextWindow(state) : null;
  const requestComposerFocus = () => { restoreComposerFocus.current = true; };
  const returnToChat = () => { requestComposerFocus(); closeOakSurface(); };
  // Attach documents and Compare a role hand focus back to the control that opened them, not to the composer.
  // Both controls unmount while their panel is open, so the opener is found again by selector on the way back.
  const lastPanel = React.useRef<OakSurface>("chat");
  React.useLayoutEffect(() => {
    if (surface !== "chat") lastPanel.current = surface;
  }, [surface]);
  React.useLayoutEffect(() => {
    const reset = previousConversationReset.current !== conversationResetVersion;
    const restored = previousHistoryRevision.current !== state.historyRevision && state.historyRestored;
    previousConversationReset.current = conversationResetVersion;
    previousHistoryRevision.current = state.historyRevision;
    if (!reset && !restored) return;
    requestComposerFocus();
    if (state.panel) closeOakSurface();
  }, [conversationResetVersion, state.historyRevision, state.historyRestored]);
  React.useLayoutEffect(() => {
    if (!restoreComposerFocus.current || composerPanel || state.presentation !== "human-agent") return;
    restoreComposerFocus.current = false;
    const opener = panelOpeners[lastPanel.current];
    lastPanel.current = "chat";
    const back = opener ? document.querySelector<HTMLButtonElement>(opener) : null;
    (back && !back.disabled ? back : composer.current)?.focus({ preventScroll: true });
  }, [composerPanel, state.draftKind, state.presentation, conversationResetVersion, state.historyRevision]);
  const selectTool = (action: OakSecondaryAction) => {
    openOakSurface(toolSurfaces[action]);
    if (action === "advice") composer.current?.focus();
  };
  // Escape inside any panel returns to the conversation, unless an open list or menu inside it handles Escape first.
  const onEscape = (event: React.KeyboardEvent) => {
    if (event.key !== "Escape" || surface === "chat" || (event.target as Element).closest?.('[role="listbox"], [role="menu"], .ui-dialog__popup')) return;
    event.preventDefault();
    event.stopPropagation();
    returnToChat();
  };
  const roleError = state.roleDraft ? oakRoleDraftError(state.roleDraft) : null;
  const [pasteHint, setPasteHint] = React.useState<string | null>(null);
  const [roleIntentOpen, setRoleIntentOpen] = React.useState(false);
  const fillRoleDescription = (text: string) => {
    setPasteHint(null);
    setOakRoleDraftInput("roleDescription", text);
    document.getElementById("oak-role-description")?.focus();
  };
  // A browser that blocks clipboard reads still lets the visitor paste by hand, so the field takes focus and says how.
  const pasteRoleDescription = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) fillRoleDescription(text);
      else { document.getElementById("oak-role-description")?.focus(); setPasteHint("Your clipboard is empty. Copy the job post, then paste it here."); }
    } catch {
      document.getElementById("oak-role-description")?.focus();
      setPasteHint("Your browser kept the clipboard private. Press Command or Control and V to paste into the field.");
    }
  };
  return (
    <>
      <div ref={reading} className="oak-workspace__reading" data-panel-open={transcriptHidden ? "true" : "false"} onKeyDownCapture={onEscape}>
      <OakWelcomePresence>
        {!intake && !verifying && !state.messages.length ? <OakEmptyState route={state.route} citationLabels={citationLabels} onStarter={text => {
          if (text === oakStarters[2]) openOakSurface("question");
          else if (!askOakSuggestion(text)) composer.current?.focus();
        }} onOpenTools={() => onToolsOpenChange(true)} onFunding={() => openOakSurface("funding")} /> : null}
      </OakWelcomePresence>
      {/* Mounted for as long as the guest needs a pass, so the widget keeps one mount whether or not the view shows. */}
      {verification.mounted ? <OakVerification siteKey={verification.siteKey} placeholder={verification.placeholder}
        attempt={verification.attempt} challenge={verifying ? "interactive" : "idle"} onCancel={cancelVerification} /> : null}
      {!transcriptHidden && !verifying && state.messages.length > 0 ? <OakTranscript key={conversationKey} state={state} conversationKey={conversationKey}
        geometryKey={geometryKey} citationLabels={citationLabels} onContact={onContact} related={oakComposerSuggestions(state, intake)}
        forgetLine={memory?.firstKeptId ?? null} /> : null}
      {!transcriptHidden && !verifying && state.messages.length > 0 ? <OakSelectionActions host={reading} composer={composer} /> : null}
      <OakOutputAnnouncements key={state.historyRevision} messages={state.messages} />
      {surface === "documents" && state.conversationId ? <OakDocumentsPanel owner={{ conversationId: state.conversationId, accountEpoch: getOakAccountContext().epoch }} onReturn={requestComposerFocus}
        saving={{ ready: Boolean(state.authStatus?.configured && state.authStatus.kind === 'account' && state.authStatus.phase === 'ready' && !state.authReauthenticate),
          busy: state.pending || state.savePending || state.historyPending || state.authPending || state.historyLifecycle.phase !== 'idle', pending: state.savePending,
          completed: state.messages.some(message => message.role === 'assistant' && message.state === 'complete'), error: state.saveError,
          onSave: () => { void saveOakCurrentConversationWithDocuments(); } }} /> : null}
      {/* The selected sections ride with the next answer as attachment chips in the message box, which reopen the review. */}
      {surface === "brief" && state.briefDraft ? <OakContactBriefEditor onReturnToChat={requestComposerFocus} citationLabels={citationLabels} answers={state.messages.flatMap(message => message.answer ? [message.answer] : [])} draft={state.briefDraft} references={getOakBriefReferences(state)} error={state.briefError} /> : null}
      {state.contactNotice ? <p className="oak-workspace__status" role="status">{state.contactNotice}</p> : null}
      {/* Progress lives in the pending turn; this line carries errors only. */}
      {/* A failed turn's own notice says it, and the transcript's one live region announces it (Q03-G4), so this line */}
      {/* stays away unless a panel hides that notice. */}
      {/* 204: the polite region stays mounted and only its text changes, so a new notice such as "Sign in again" is announced. */}
      {/* 205: a revoked session's "Your session ended" panel already shows the sign-in line, so that line is only heard here, */}
      {/* never drawn twice; any other error is still drawn. shortcut: matched by its opening words, export the notice when it changes. */}
      <div className="oak-workspace__live" role="status" aria-live="polite">
        {state.error && !(!transcriptHidden && oakTurnNotices.includes(state.error) && state.messages.at(-1)?.state === "failed") ? <div
          className={state.authReauthenticate && !state.pending && state.error.startsWith("Sign in again") ? "sr-only" : "oak-workspace__status"}><Icon name="alert" />{state.error}</div> : null}</div>
      {accountNeedsAttention || surface === "conversation" ? <OakAccountContinuation state={state} onContact={onContact} /> : null}
      {surface === "funding" ? <OakFundingPanel onReturn={returnToChat} allowance={oakAllowanceSummary(state.authStatus)} /> : null}
      {surface === "conversation" ? <OakConversationPanel state={state} onReturn={returnToChat} />
        : state.saveError || state.historyError ? <p className="oak-workspace__status" role="status">{state.saveError ?? state.historyError}</p> : null}
      {/* v3: current public research runs on its own and shows in the answer's steps, so nothing asks for it here. */}
      {!verifying && ["voice", "role", "question", "advice"].includes(surface) ? <div className="oak-workspace__workflow">
        {surface === "voice" && !state.pending ? <OakVoicePanel state={state} onReturn={returnToChat}
          onUseTranscript={text => { if (useOakVoiceTranscript(text)) requestComposerFocus(); }} /> : null}
        {surface === "advice" ? <OakAdvicePanel draft={state.draft} composerId={composerId} inputRef={composer} onReturn={returnToChat} /> : null}
        {surface === "role" && state.roleDraft ? <WorkflowPanel title="Compare a role" returns="Up to four requirements, each matched to Steve's cited work. Nothing sends until Compare." pose="reviewing" onReturn={returnToChat} className="oak-role-intake"
          tip={{ id: "role", text: "Paste a job post, or try the sample, and I'll check its key requirements against Steve's public work." }}>
          {/* D116: each field is a labelled well (Field + InputGroup); the byte counter rides in the well, errors use the status line. */}
          {state.roleDraft.requirementSource ? <section className="oak-group">
            <h3 className="oak-group__header">Role description</h3>
            {/* One iOS row: the document tile, what is selected, and the way to change it at the right edge. */}
            <div className="oak-group__body oak-role-intake__source">
              <span className="oak-group__icon" aria-hidden="true"><Icon name="bookOpenText" /></span>
              <span>{state.roleDraft.requirementSource.sourceIds.length} document {state.roleDraft.requirementSource.sourceIds.length === 1 ? "section selected" : "sections selected"} for this comparison</span>
              <Button type="button" variant="ghost" size="sm" onClick={openOakDocuments}>Change selection</Button>
            </div>
          </section> : <div className="oak-group"><Field>
            <FieldLabel htmlFor="oak-role-description"><Icon name={oakMeaningIcons["field.role"]} size={14} />Role description</FieldLabel>
            <InputGroup>
              <Textarea variant="bare" rows={5} id="oak-role-description" form={composerId} value={state.roleDraft.roleDescription}
                placeholder="Paste the job description or the requirements that matter most"
                aria-describedby="oak-role-limit oak-role-error"
                onChange={event => setOakRoleDraftInput("roleDescription", event.target.value)} />
              {/* D120: two quick ways in (the clipboard, or a sample post to try the flow), and a counter in characters. */}
              <InputGroupAddon>
                <Button type="button" variant="secondary" size="sm" onClick={() => void pasteRoleDescription()}>
                  <Icon name={oakMeaningIcons["action.paste"]} />Paste job post
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => fillRoleDescription(oakSampleRole)}>
                  <Icon name={oakMeaningIcons["action.sample"]} />Try a sample role
                </Button>
                {/* shortcut: counts UTF-16 characters while the contract limits the encoded size (UTF-8); they match for typical English posts, and the error line covers the rest. */}
                <FieldCount id="oak-role-limit" value={state.roleDraft.roleDescription.length} limit={roleDescriptionMaxBytes} unit="characters" />
              </InputGroupAddon>
            </InputGroup>
          </Field></div>}
          {/* Review v4 (Profound, Airtasker, Mindtrip): the job post leads, alone. What to compare already has a sensible
              default, so the question and its examples fold behind one optional row instead of competing with the post. */}
          {/* Opened whenever its field needs attention, so an error never points at a hidden field. */}
          <details className="oak-role-intake__more" open={roleIntentOpen || !state.roleDraft.intent.trim() || undefined}
            onToggle={event => setRoleIntentOpen(event.currentTarget.open)}>
            <summary><Icon name={oakMeaningIcons["field.role-intent"]} size={16} /><span>Change what to compare</span><span className="oak-role-intake__optional">Optional</span></summary>
            <OakRoleExamples />
            <div className="oak-group"><Field>
              <FieldLabel htmlFor="oak-role-intent"><Icon name={oakMeaningIcons["field.role-intent"]} size={14} />What would you like to compare?</FieldLabel>
              <InputGroup>
                <Textarea variant="bare" rows={2} id="oak-role-intent" form={composerId} value={state.roleDraft.intent} aria-describedby="oak-role-error"
                  placeholder="For example, which requirements Steve's public work supports"
                  onChange={event => setOakRoleDraftInput("intent", event.target.value)} />
              </InputGroup>
            </Field></div>
          </details>
          <p id="oak-role-error" className="oak-role-intake__error" role="status">{pasteHint ?? roleError}</p>
        </WorkflowPanel> : null}
        {surface === "question" && state.questionDraft ? <OakQuestionDraftPanel draft={state.questionDraft} message={state.draft} composerId={composerId} onReturn={returnToChat} /> : null}
      </div> : null}
      </div>
      <OakComposer state={state} documents={documents} composerId={composerId} composerRef={composer} intake={intake}
        standby={verifying || (!state.pending && standbySurface)}
        actionBar={Boolean(state.roleDraft) || (surface === "question" && Boolean(state.questionDraft)) || surface === "advice"}
        menuContainer={menuContainer} toolsOpen={toolsOpen} onToolsOpenChange={onToolsOpenChange}
        onSelectTool={selectTool} onEscape={onEscape} context={memory ?? undefined} />
    </>
  );
}
