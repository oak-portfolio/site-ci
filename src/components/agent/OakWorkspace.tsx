import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/Icon";
import {
  closeOakWorkspace,
  getOakVoiceController,
  getOakWorkspace,
  installOakPresentationOwner,
  oakReturnFocus,
  requestOakWorkspace,
  startNewOakConversation,
  stopOakTurn,
  useOakWorkspace,
} from "@/lib/oakWorkspace";
import { getOakDocumentsController } from "@/lib/oakDocumentsWorkspace";
import { getOakFunnel } from "@/lib/oakFunnelClient";
import { oakViewportNotice } from "@/lib/oakViewportSupport";
import { OakContactMenu } from "./OakContactMenu";
import { OakConversation, clearOakTranscriptPosition } from "./OakConversation";
import { OakAccountMenu } from "./OakAccountMenu";
import type { OakCitationLabels } from "@/lib/oakCitationLabels";
import { useOakWorkspaceSize } from "./useOakWorkspaceSize";
import { OakSprite, OakSpritesProvider, type OakActivitySpritePose, type OakSprites } from "./OakActivitySprite";
import { useOakLauncherViewport } from "@/lib/useOakCornerViewport";
import { Kbd } from "@/components/ui/kbd";
import { ToastProvider, ToastViewport, createToastManager } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { onOakToast } from "@/lib/oakToasts";
import { OakCommandPaletteSearch } from "@/lib/oakFlags/commandPalette";

/**
 * Where focus lands when the workspace opens: the message box when it can be typed in, so typing starts a question.
 * The larger-window notice (body hidden and inert) and touch opens (no surprise keyboard) start on Close.
 */
export function oakWorkspaceInitialFocus(popup: HTMLElement | null, close: HTMLElement | null, { unsupported, touch }: { unsupported: boolean; touch: boolean }) {
  if (unsupported || touch) return close;
  const composer = popup?.querySelector<HTMLTextAreaElement>("#oak-composer-input:not(:disabled)");
  return composer && !composer.closest("[inert], [hidden]") ? composer : close;
}

/** Recover a persisted modal's focus after a route swap, without changing reading scroll. */
export function restoreOakWorkspaceFocus(popup: HTMLDivElement | null, preferred: HTMLElement | null, fallback: HTMLElement | null) {
  if (getOakWorkspace().presentation !== "human-agent" || !popup?.isConnected || popup.inert || popup.hidden) return false;
  const document = popup.ownerDocument;
  if (document.activeElement?.isConnected && popup.contains(document.activeElement)) return true;
  for (const target of [preferred, fallback, popup]) {
    if (!target?.isConnected || !popup.contains(target) || target.closest("[inert], [hidden], [aria-hidden='true']") ||
      target.matches(":disabled") || !target.getClientRects().length || document.defaultView?.getComputedStyle(target).visibility === "hidden") continue;
    target.focus({ preventScroll: true });
    if (popup.contains(document.activeElement)) return true;
  }
  return false;
}

/** Retained owners keep their ordinary cancellation controls outside the hidden intake. */
export function OakViewportWorkControls({ modelPending }: { modelPending: boolean }) {
  const documents = getOakDocumentsController();
  const documentState = React.useSyncExternalStore(documents.subscribe, documents.snapshot, documents.snapshot);
  const voice = getOakVoiceController();
  const voiceState = React.useSyncExternalStore(voice.subscribe, voice.getSnapshot, voice.getSnapshot);
  const voiceActive = ["permission", "recording", "stopping", "transcribing", "clip-ready"].includes(voiceState.phase);
  if (!modelPending && !documentState.pending && !voiceActive) return null;
  return <div className="oak-role-entry">
    {modelPending ? <Button type="button" variant="secondary" size="sm" onClick={() => stopOakTurn()}><Icon name="stop" />Stop</Button> : null}
    {documentState.pending ? <Button type="button" variant="ghost" size="sm" onClick={() => documents.cancel()}><Icon name="stop" />Stop preparation</Button> : null}
    {voiceState.phase === "recording" ? <Button type="button" variant="secondary" size="sm" onClick={voice.stop}><Icon name="pause" />Stop recording</Button> : null}
    {voiceActive ? <Button type="button" variant="ghost" size="sm" onClick={voice.cancel}>Cancel voice input</Button> : null}
  </div>;
}

const noSprites: OakSprites = {};
const oakToastManager = createToastManager();
onOakToast(toast => oakToastManager.add(toast));

export function OakWorkspace({ citationLabels, activitySprites = noSprites }: {
  citationLabels?: OakCitationLabels; activitySprites?: OakSprites;
}) {
  const state = useOakWorkspace();
  const launcherViewport = useOakLauncherViewport();
  const popup = React.useRef<HTMLDivElement | null>(null);
  const viewportNoticeId = React.useId();
  const retainedFocus = React.useRef<HTMLElement | null>(null);
  const close = React.useRef<HTMLButtonElement | null>(null);
  const safeArea = React.useRef<HTMLDivElement | null>(null);
  const portalHost = React.useRef<HTMLDivElement | null>(null);
  const lastFocused = React.useRef<HTMLElement | null>(null);
  const [contactOpen, setContactOpen] = React.useState(false);
  const [toolsOpen, setToolsOpen] = React.useState(false);
  const [accountOpen, setAccountOpen] = React.useState(false);
  // The message box takes initial focus when it can be typed in, so typing starts a question; otherwise Close does, and its hint opens on hover, not focus.
  const [closeHint, setCloseHint] = React.useState(false);
  const [conversationResetVersion, setConversationResetVersion] = React.useState(0);
  const open = state.presentation === "human-agent";
  const unsupported = !state.viewportSupported;
  // P07-G2: anonymous funnel steps, one id per tab. Each fires once per tab or per turn.
  React.useEffect(() => { if (open) getOakFunnel().open(); }, [open]);
  React.useEffect(() => { if (contactOpen) getOakFunnel().contact(); }, [contactOpen]);
  React.useEffect(() => { getOakFunnel().observe(state.messages); }, [state.messages]);
  const viewportSizing = useOakWorkspaceSize(open, safeArea);
  const sizing = unsupported ? {
    ...viewportSizing,
    fullScreen: false,
    frame: { top: viewportSizing.bounds.top, left: "auto" as const, right: viewportSizing.bounds.right },
    size: { width: Math.min(viewportSizing.size.width, viewportSizing.bounds.availableWidth), height: viewportSizing.bounds.maxHeight },
  } : viewportSizing;
  // Oak, live: on open the window fades in and its header, content and message box rise in on a short stagger. The mark
  // lasts just past the last delay plus a page beat, so a panel opened later never replays it.
  const [entering, setEntering] = React.useState(false);
  // Review v6: Full opens from the launcher. The window grows out of the button it was opened from (or the bottom centre
  // when opened another way), a glow blooms and fades, then the parts rise in. The mark outlasts the last delay.
  const openOrigin = React.useRef<{ x: number; y: number } | null>(null);
  React.useEffect(() => {
    if (!open) { setEntering(false); openOrigin.current = null; return; }
    setEntering(true);
    const timer = setTimeout(() => { setEntering(false); openOrigin.current = null; }, 1100);
    return () => clearTimeout(timer);
  }, [open]);
  React.useEffect(installOakPresentationOwner, []);
  React.useEffect(() => {
    const recoverFocus = () => restoreOakWorkspaceFocus(popup.current, lastFocused.current, close.current);
    document.addEventListener("astro:after-swap", recoverFocus);
    document.addEventListener("astro:page-load", recoverFocus);
    return () => {
      document.removeEventListener("astro:after-swap", recoverFocus);
      document.removeEventListener("astro:page-load", recoverFocus);
    };
  }, []);
  React.useEffect(() => {
    if (!open) { setContactOpen(false); setToolsOpen(false); lastFocused.current = null; }
  }, [open]);
  React.useLayoutEffect(() => {
    if (!open) { retainedFocus.current = null; return; }
    if (unsupported) {
      const active = document.activeElement;
      const previous = lastFocused.current;
      if (previous?.closest(".oak-workspace__body")) retainedFocus.current = previous;
      setToolsOpen(false);
      if (active instanceof HTMLElement && active.closest(".oak-workspace__body"))
        close.current?.focus({ preventScroll: true });
    } else if (retainedFocus.current) {
      const target = retainedFocus.current;
      // Restore the retained intake only if the visitor has not moved to Contact.
      if (document.activeElement === close.current && target.isConnected &&
          !target.closest("[inert], [hidden], [aria-hidden='true']") && !target.matches(":disabled") && target.getClientRects().length)
        target.focus({ preventScroll: true });
      else restoreOakWorkspaceFocus(popup.current, target, close.current);
      retainedFocus.current = null;
    }
  }, [open, unsupported]);
  return (
    <OakSpritesProvider value={activitySprites}><ToastProvider toastManager={oakToastManager} limit={2}>
    {/* One hint delay for the whole workspace: hover an icon and its name shows almost at once, then moves with the pointer. */}
    <TooltipProvider delay={200} closeDelay={60}>
      <div ref={safeArea} className="oak-workspace__safe-area" hidden aria-hidden="true" />
      {/* Keep the portal inside the island Astro persists when it swaps the body. */}
      <div ref={portalHost} data-oak-workspace-portal-host />
      {state.agentEligible && !state.overlayActive && state.presentation === "human-browse" ? (
        <div className="oak-workspace-launcher" style={launcherViewport?.style} data-oak-launcher-compact={launcherViewport?.compact ? "true" : undefined}>
          {state.viewportNotice ? <p id={viewportNoticeId} className="oak-workspace__viewport-notice oak-workspace__viewport-notice--entry" role="status">{oakViewportNotice}</p> : null}
          <Button
            id="oak-agent-launcher"
            aria-describedby={state.viewportNotice ? viewportNoticeId : undefined}
            size="sm"
            variant="secondary"
            data-oak-workspace-launcher
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              openOrigin.current = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
              requestOakWorkspace(event.currentTarget);
            }}
          >
            {/* The mascot above is Oak; the launcher says "talk to an AI" with one icon. */}
            <Icon name="aiChat" className="oak-workspace-launcher__icon" />
            <span>Oak AI Agent</span>
          </Button>
        </div>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) closeOakWorkspace();
        }}
      >
          <DialogContent
            ref={popup}
            open={open}
            variant={sizing.fullScreen ? "window" : "panel"}
            container={portalHost}
            portalClassName="oak-workspace__layer"
            backdropClassName="oak-workspace__backdrop"
            className="oak-workspace"
            style={{ top: sizing.frame.top, left: sizing.frame.left, right: sizing.frame.right, width: sizing.size.width, height: sizing.size.height,
              ["--oak-open-x" as string]: `${openOrigin.current?.x ?? sizing.size.width / 2}px`,
              ["--oak-open-y" as string]: `${openOrigin.current?.y ?? sizing.size.height - 48}px` }}
            data-unsupported={unsupported ? "true" : undefined}
            data-inline-controls={!unsupported && sizing.inlineControls ? "true" : "false"}
            data-expanded="true"
            data-full-screen={sizing.fullScreen ? "true" : "false"}
            data-entering={entering ? "" : undefined}
            data-compact={sizing.size.height < 560 ? "true" : "false"}
            data-short-viewport={sizing.bounds.maxHeight < 560 ? "true" : "false"}
            initialFocus={(openType) => oakWorkspaceInitialFocus(popup.current, close.current, { unsupported, touch: openType === "touch" })}
            finalFocus={oakReturnFocus}
            inert={!open}
            onFocusCapture={event => {
              if (event.target instanceof HTMLElement && event.currentTarget.contains(event.target)) lastFocused.current = event.target;
            }}
            onKeyDownCapture={(event) => {
              if (event.key === "Escape" && (contactOpen || toolsOpen || accountOpen)) {
                event.preventDefault();
                event.stopPropagation();
                const target = contactOpen ? "[data-oak-contact-trigger]"
                  : accountOpen ? "[data-oak-account-trigger]" : "[data-oak-tools-trigger]";
                setContactOpen(false); setToolsOpen(false); setAccountOpen(false);
                popup.current
                  ?.querySelector<HTMLElement>(target)
                  ?.focus({ preventScroll: true });
              }
            }}
          >
            {entering ? <span className="oak-workspace__bloom" aria-hidden="true" /> : null}
            <header className="oak-workspace__header">
              <div className="oak-workspace__heading">
                <DialogTitle>Oak AI Agent</DialogTitle>
                <DialogDescription>
                  <span className="sr-only">Ask me about Steve's public work.</span>
                </DialogDescription>
              </div>
              <div className="oak-workspace__header-actions">
                <OakCommandPaletteSearch container={popup} active={open} />
                <OakContactMenu
                  container={popup}
                  open={contactOpen}
                  onOpenChange={next => { setContactOpen(next); if (next) { setToolsOpen(false); setAccountOpen(false); } }}
                />
                {/* Review v6: starting over is a visible header action. */}
                {!unsupported ? <Tooltip>
                  <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="New conversation" onClick={() => {
                    clearOakTranscriptPosition();
                    startNewOakConversation();
                    setConversationResetVersion(version => version + 1);
                  }} />}>
                    <Icon name="newChat" />
                  </TooltipTrigger>
                  <TooltipContent>New conversation</TooltipContent>
                </Tooltip> : null}
                {/* R11: who you are, saved chats, answers, privacy and sign-in live in one menu: a gear for a guest, an initial once signed in. */}
                {!unsupported ? <OakAccountMenu
                  container={popup}
                  open={accountOpen}
                  onOpenChange={next => { setAccountOpen(next); if (next) { setContactOpen(false); setToolsOpen(false); } }}
                /> : null}
                {/* The hint advertises Esc, so Escape while it shows closes the workspace instead of only the hint. */}
                <Tooltip open={closeHint} onOpenChange={(next, details) => {
                  setCloseHint(next && details.reason !== "trigger-focus");
                  if (details.reason === "escape-key") closeOakWorkspace();
                }}>
                  <TooltipTrigger render={<DialogClose ref={close} aria-label="Close" aria-keyshortcuts="Escape" render={<Button variant="ghost" size="icon" />} />}>
                    <Icon name="cancel" />
                  </TooltipTrigger>
                  <TooltipContent>Close<Kbd>Esc</Kbd></TooltipContent>
                </Tooltip>
              </div>
            </header>
            {unsupported ? <section className="oak-workspace__viewport-notice" aria-label="Window size">
              {/* Centered like the welcome: Oak with the bigger screen, a short title and the one line. The conversation waits behind it. */}
              <OakSprite pose="larger-window" size="hero" />
              <h3 className="oak-workspace__viewport-title">A little more room, please</h3>
              <p role="status">{oakViewportNotice}</p>
              <p className="oak-workspace__viewport-detail">Your conversation stays here and comes back when the window is larger.</p>
              <OakViewportWorkControls modelPending={state.pending} />
            </section> : null}
            <div className="oak-workspace__body" hidden={unsupported} inert={unsupported}>
              <OakConversation
                state={state}
                conversationResetVersion={conversationResetVersion}
                citationLabels={citationLabels}
                onContact={() => { setToolsOpen(false); setAccountOpen(false); setContactOpen(true); }}
                menuContainer={popup}
                toolsOpen={toolsOpen}
                onToolsOpenChange={next => { setToolsOpen(next); if (next) { setContactOpen(false); setAccountOpen(false); } }}
                geometryKey={sizing.geometryKey}
              />
            </div>
            <ToastViewport media={data => activitySprites[data.pose as OakActivitySpritePose] ? <OakSprite pose={data.pose as OakActivitySpritePose} size="badge" /> : null} />
          </DialogContent>
      </Dialog>
    </TooltipProvider>
    </ToastProvider></OakSpritesProvider>
  );
}
