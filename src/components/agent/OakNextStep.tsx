import * as React from "react";
import { motion, useReducedMotion, type TargetAndTransition, type Transition } from "motion/react";
import { Icon } from "@/components/ui/Icon";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { oakNextStepPrefill, type OakNextStep as Step } from "@/lib/oakNextStep";
import { getOakWorkspace, openOakSurface, setOakContactBriefInput, setOakDraft, setOakRoleDraftInput } from "@/lib/oakWorkspace";
import { useEscapeCollapse } from "./useEscapeCollapse";

/**
 * Opens the suggested tool with the visitor's own question in it, and never sends anything. Fields the visitor already
 * typed into are left alone.
 */
export function runOakNextStep(step: Step, question: string) {
  openOakSurface(step.action);
  const state = getOakWorkspace();
  const prefill = oakNextStepPrefill(step.action, question);
  if (!prefill) return;
  if (step.action === "role" && state.roleDraft) setOakRoleDraftInput("intent", prefill);
  else if (step.action === "brief" && state.briefDraft && !state.briefDraft.goals.trim()) setOakContactBriefInput("goals", prefill);
  else if (step.action === "advice" && state.draftKind === "advice" && !state.draft.trim()) setOakDraft(prefill);
}

/**
 * D128: one full-width card after an answer that opens the matching tool (Perplexity's Related row, ChatGPT's app pill).
 * It wears the Tools menu row's tile, rises in after the answer, and its chevron leans 2px toward the tool on hover.
 */
export function OakNextStep({ step, question, arrival }: {
  step: Step; question: string;
  arrival: { initial: TargetAndTransition | false; animate: TargetAndTransition; transition: Transition };
}) {
  const reduced = useReducedMotion();
  // The name is the visible title and hint, so voice control can say what the eye reads (label in name, m2 F7).
  return <motion.button type="button" className="oak-next-step" data-action={step.action}
    initial={arrival.initial} animate={arrival.animate} transition={arrival.transition} whileTap={reduced ? undefined : { scale: 0.98 }}
    onClick={() => runOakNextStep(step, question)}>
    <span className="oak-answer-tile" aria-hidden="true"><span className="oak-starter-glyph" data-tone={step.tone}><Icon name={step.icon} size={18} /></span></span>
    <span className="oak-next-step__text">
      <span className="oak-next-step__title">{step.title}</span>
      <span className="oak-next-step__hint">{step.hint}</span>
    </span>
    <span className="oak-next-step__chevron" aria-hidden="true"><Icon name="chevronRight" size={16} /></span>
  </motion.button>;
}

/**
 * PR 1b: the disclosure under the next-step card. Closed by default; the panel stays mounted so an
 * arranged answer's Related rows can still portal into it, and Base UI hides it, so Tab skips the closed content.
 * PR gate 4: Escape collapses it while open (see useEscapeCollapse). An arranged answer's follow-up pills portal into this
 * panel, and React listens on the portal slot itself, so only the capture-phase listener hears Escape before the chat closes.
 * Ticket 23: opening scrolls the panel into view, and pressing a row in it collapses it and hands focus to the message box.
 */
export function OakOtherWays({ arrival, children }: {
  arrival: { initial: TargetAndTransition | false; animate: TargetAndTransition; transition: Transition };
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const { wrapper, trigger } = useEscapeCollapse(open, setOpen);
  const panel = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const node = wrapper.current;
    if (!node) return;
    // Capture phase, before the row asks its question: focus is already in the message box when the row goes away, so the
    // dialog has nothing to restore it to (M5 keyboard K1).
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".oak-other-ways__body .ui-suggestion")) return;
      setOpen(false);
      document.getElementById("oak-composer-input")?.focus({ preventScroll: true });
    };
    node.addEventListener("click", onClick, true);
    return () => node.removeEventListener("click", onClick, true);
  }, [wrapper]);
  React.useEffect(() => {
    const node = panel.current;
    if (!open || !node) return;
    // The panel grows over its height transition, so the transcript follows it until it is fully in view.
    const follow = new ResizeObserver(() => node.scrollIntoView({ block: "nearest" }));
    follow.observe(node);
    return () => follow.disconnect();
  }, [open]);
  return <motion.div ref={wrapper} className="oak-other-ways" initial={arrival.initial} animate={arrival.animate} transition={arrival.transition}>
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger ref={trigger} className="oak-other-ways__trigger">
        <span>Other ways to continue</span>
        <Icon name="arrowDown" size={16} />
      </CollapsibleTrigger>
      <CollapsibleContent ref={panel} keepMounted className="oak-other-ways__panel"><div className="oak-other-ways__body">{children}</div></CollapsibleContent>
    </Collapsible>
  </motion.div>;
}
