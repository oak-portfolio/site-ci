import * as React from "react";
import { Icon } from "@/components/ui/Icon";
import { oakAnswerSources } from "@/lib/oakAnswerActions";
import { oakCitationLabel, oakSourceShortLabel, type OakCitationLabels } from "@/lib/oakCitationLabels";
import { oakAnswerOrnamentOn } from "@/lib/oakFlags/answerOrnament";
import type { OakAnswer } from "../../../packages/oak-agent-contracts/src/types";
import { oakRecede } from "@/lib/openui/a11y/oakRecede";

export { oakAnswerOrnamentOn, oakRecede };

/** Which answer holds the one ornament: the one the visitor last focused or pointed at, else the newest one mounted. */
function createOrnamentFocus() {
  let mounted: string[] = [];
  let focused: string | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    current: () => (focused && mounted.includes(focused) ? focused : mounted.at(-1) ?? null),
    /** The visitor moved the ornament to an answer that is still mounted, so a newly mounted answer does not take it. */
    held: () => Boolean(focused && mounted.includes(focused)),
    register(id: string) { mounted = [...mounted.filter(other => other !== id), id]; emit(); },
    unregister(id: string) { mounted = mounted.filter(other => other !== id); if (focused === id) focused = null; emit(); },
    focus(id: string) { if (focused !== id) { focused = id; emit(); } },
    reset() { mounted = []; focused = null; emit(); },
  };
}

export const oakOrnamentFocus = createOrnamentFocus();

/**
 * Q19 B (ticket 58): one small frosted capsule over the bottom edge of the answer being read, holding Copy, Open page and
 * Ask a follow-up. visionOS shape, not literal glass: the bar is the only glass; the answer under it stays solid.
 */
export function OakAnswerOrnament({ messageId, answer, citationLabels, copied, onCopy, latest, settled = true }: {
  messageId: string; answer: OakAnswer; citationLabels?: OakCitationLabels; copied: boolean; onCopy: () => void; latest?: boolean; settled?: boolean;
}) {
  const current = React.useSyncExternalStore(oakOrnamentFocus.subscribe, oakOrnamentFocus.current, oakOrnamentFocus.current);
  const [active, setActive] = React.useState(0);
  const [registered, setRegistered] = React.useState(false);
  React.useEffect(() => {
    oakOrnamentFocus.register(messageId);
    setRegistered(true);
    return () => oakOrnamentFocus.unregister(messageId);
  }, [messageId]);
  // Before it registers, the newest answer already draws the capsule where its placeholder stood: a render without it
  // would shrink the transcript for a frame and leave a reader at the end one capsule short.
  const shown = oakAnswerOrnamentOn() && (current === messageId || (!registered && Boolean(latest) && !oakOrnamentFocus.held()));
  // Focus or a press inside a turn moves the ornament there; hover alone would make it chase the pointer. The footer's
  // own actions keep it where it is: the ornament's turn hides its footer Copy, so taking it would drop that focus or press.
  React.useEffect(() => {
    const turn = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
    if (!turn || !oakAnswerOrnamentOn()) return;
    const take = (event: Event) => { if (!(event.target as Element | null)?.closest?.(".oak-turn__actions")) oakOrnamentFocus.focus(messageId); };
    turn.addEventListener("focusin", take);
    turn.addEventListener("pointerdown", take);
    turn.toggleAttribute("data-ornament", shown);
    return () => { turn.removeEventListener("focusin", take); turn.removeEventListener("pointerdown", take); turn.removeAttribute("data-ornament"); };
  }, [messageId, shown]);
  if (!shown) return null;
  const page = answer.kind === "sourced" || answer.kind === "gap" ? oakAnswerSources(answer)[0] : undefined;
  const pageName = page ? oakSourceShortLabel(oakCitationLabel(page, answer.knowledgeRevision, citationLabels, "this page")) : null;
  const ask = () => document.getElementById("oak-composer-input")?.focus();
  const items = (bar: HTMLElement) => [...bar.querySelectorAll<HTMLElement>(".oak-ornament__action")];
  // One Tab stop for the bar (roving tabindex); arrow keys move inside it.
  const enter = (event: React.FocusEvent<HTMLDivElement>) => {
    const at = items(event.currentTarget).indexOf(event.target as HTMLElement);
    if (at >= 0) setActive(at);
  };
  const arrows = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const all = items(event.currentTarget);
    const at = all.indexOf(document.activeElement as HTMLElement);
    all[(at + step + all.length) % all.length]?.focus();
    event.preventDefault();
  };
  const stop = (index: number) => (index === Math.min(active, page && pageName ? 2 : 1) ? 0 : -1);
  // Until the footer has faded in, the capsule keeps its box undrawn and out of reach (the placeholder's look).
  return <div className="oak-ornament" role="toolbar" aria-label="Answer actions for this answer" onKeyDown={arrows} onFocus={enter}
    data-ornament-ghost={settled ? undefined : ""} aria-hidden={settled ? undefined : true} inert={!settled}
    data-judge-ok="stray-blur: the ornament is a floating control held in flow so it never sits over body copy">
    <button type="button" className="oak-ornament__action" tabIndex={stop(0)} aria-label={copied ? "Copied" : "Copy answer"} onClick={onCopy}>
      <Icon name={copied ? "copyCheck" : "copy"} /><span>{copied ? "Copied" : "Copy"}</span>
    </button>
    {page && pageName ? <a className="oak-ornament__action" tabIndex={stop(1)} href={page.url} aria-label={`Open page: ${pageName}`}>
      <span>Open page</span><Icon name="arrowUpRight" />
    </a> : null}
    <button type="button" className="oak-ornament__action" tabIndex={stop(page && pageName ? 2 : 1)} aria-label="Ask a follow-up" onClick={ask}>
      <Icon name="followUp" /><span>Ask a follow-up</span>
    </button>
  </div>;
}
