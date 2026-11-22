import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { oakMotion } from "@/lib/oakMotion";
import { wrapTab } from "@/lib/oakFocusWrap";
import {
  dismissOakTurnstileChallenge, failOakTurnstile, getOakTurnstileServerState, getOakTurnstileState, mountOakTurnstile, oakTurnstileSiteKey,
  reopenOakTurnstileChallenge, retryOakTurnstile, subscribeOakTurnstile, type OakTurnstileChallenge, type OakTurnstileState,
} from "../../lib/oakTurnstile";
import type { OakWorkspaceState } from "@/lib/oakWorkspace";
import { OakSprite } from "./OakActivitySprite";
import { oakHeroTone } from "./WorkflowPanel";

type FocusTarget = { addEventListener: (type: "focusin", listener: (event: FocusEvent) => void) => void; removeEventListener: (type: "focusin", listener: (event: FocusEvent) => void) => void };

/** The widget loads a few seconds after the agent opens and its frame grabs focus; unless the visitor is being asked, focus goes back to where it was. */
export function keepFocusOutOfTurnstile(widget: FocusTarget, interactive: () => boolean) {
  const onFocusIn = (event: FocusEvent) => {
    if (interactive()) return;
    const back = event.relatedTarget as HTMLElement | null;
    if (back?.isConnected) back.focus({ preventScroll: true });
    else (event.target as HTMLElement | null)?.blur();
  };
  widget.addEventListener("focusin", onFocusIn);
  return () => widget.removeEventListener("focusin", onFocusIn);
}

/** Cloudflare's managed challenge, shown to a guest once before the first sponsored answer (P03-G1). */
export function OakTurnstile({ siteKey, attempt = 0 }: { siteKey: string; attempt?: number }) {
  const node = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    let closed = false, cleanup: (() => void) | undefined;
    const guard = node.current ? keepFocusOutOfTurnstile(node.current, () => getOakTurnstileState().challenge === "interactive") : undefined;
    if (node.current) void mountOakTurnstile(node.current, siteKey).then(done => { if (closed) done(); else cleanup = done; }, () => { if (!closed) failOakTurnstile(); });
    return () => { closed = true; guard?.(); cleanup?.(); };
  }, [siteKey, attempt]);
  return <div ref={node} className="oak-verification__widget" />;
}

/**
 * Ticket 23 (recruiter minor 3): under the message box, a failed or cancelled check is one notice row on the box's own inset,
 * a line and one secondary pill. A failure wins over a cancel, since Retry also brings the check back.
 */
export function OakVerificationNotice({ turnstileKey, turnstile }: { turnstileKey?: string; turnstile: OakTurnstileState }) {
  const failed = Boolean(turnstileKey && turnstile.failed);
  if (!failed && !((turnstileKey || turnstile.placeholder) && turnstile.challenge === "dismissed")) return null;
  return <p className="oak-verification-notice" role={failed ? "alert" : undefined}>
    <Icon name="securityCheck" size={16} />
    <span className="oak-verification-notice__text">{failed ? "The quick check could not finish." : "Oak answers after a quick check."}</span>
    <Button type="button" variant="secondary" size="sm" onClick={failed ? retryOakTurnstile : reopenOakTurnstileChallenge}>
      {failed ? "Retry the check" : "Finish the quick check to send"}</Button>
  </p>;
}

/**
 * R11: whether the conversation area is in verification mode. `mounted` keeps the widget alive (out of sight) for as long as
 * the guest still needs a pass; `verifying` is true only once Cloudflare needs the visitor and no panel holds the window.
 */
export function useOakVerification(authStatus: OakWorkspaceState["authStatus"], standby: boolean) {
  const turnstile = React.useSyncExternalStore(subscribeOakTurnstile, getOakTurnstileState, getOakTurnstileServerState);
  const siteKey = oakTurnstileSiteKey(authStatus, turnstile);
  const mounted = Boolean(siteKey || turnstile.placeholder);
  return { siteKey, placeholder: turnstile.placeholder, mounted, verifying: mounted && turnstile.challenge === "interactive" && !standby,
    attempt: turnstile.attempt, dismiss: dismissOakTurnstileChallenge };
}

/**
 * R11 verification mode (Oak: "it should not be under the composer"). The widget mounts once, out of sight, for as long as
 * the guest still needs a pass, so an invisible or managed pass never flashes anything. Only when Cloudflare says the
 * check needs the visitor does the conversation area turn into this centred view: Oak's shield, a heading, one line, and
 * the widget in a rounded frame. A pass returns to the conversation; Escape or Cancel returns without sending.
 */
export function OakVerification({ siteKey, challenge, placeholder = false, attempt = 0, onCancel }: {
  siteKey?: string;
  attempt?: number;
  challenge: OakTurnstileChallenge;
  placeholder?: boolean;
  onCancel: () => void;
}) {
  const visible = challenge === "interactive";
  const layer = React.useRef<HTMLElement>(null);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const titleId = React.useId();
  const reduced = useReducedMotion();
  const reveal = oakMotion("reveal", reduced);
  const settle = oakMotion("settle", reduced);
  React.useEffect(() => { if (visible) heading.current?.focus({ preventScroll: true }); }, [visible]);
  React.useEffect(() => {
    const dialog = visible ? layer.current?.closest<HTMLElement>("[role=dialog]") : null;
    if (!dialog) return;
    const holdTab = (event: KeyboardEvent) => wrapTab(event, dialog);
    dialog.addEventListener("keydown", holdTab);
    return () => dialog.removeEventListener("keydown", holdTab);
  }, [visible]);
  return (
    <motion.section ref={layer} className="oak-verification" data-visible={visible ? "true" : "false"} aria-labelledby={visible ? titleId : undefined}
      aria-hidden={visible ? undefined : true} inert={!visible} initial={false} animate={visible ? reveal.animate : reveal.initial} transition={reveal.transition}
      onKeyDown={event => {
        if (!visible || event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}>
      {visible ? <>
        <motion.div className="oak-panel-hero" aria-hidden="true" data-tone={oakHeroTone("shield")}
          initial={settle.initial} animate={settle.animate} transition={settle.transition}>
          <OakSprite pose="shield" size="large" />
        </motion.div>
        <h2 id={titleId} ref={heading} tabIndex={-1} className="oak-verification__title">A quick check before Oak answers</h2>
        <p className="oak-verification__text">Cloudflare wants to confirm a person is asking. Your question is saved and ready to send.</p>
      </> : null}
      <div className="oak-verification__frame">
        {placeholder ? <div className="oak-verification__placeholder" data-oak-verification-placeholder="">Cloudflare check</div>
          : siteKey ? <OakTurnstile siteKey={siteKey} attempt={attempt} /> : null}
      </div>
      {visible ? <div className="oak-verification__actions"><Button type="button" variant="secondary" size="sm" onClick={onCancel}>Cancel</Button></div> : null}
    </motion.section>
  );
}
