import * as React from "react";
import { defineComponent, useTriggerAction } from "@openuidev/react-lang";
import { z } from "zod";
import { Icon } from "@/components/ui/Icon";
import { oakContactCardAllowed } from "@/lib/oakContactCardOnce";
import { oakContactCardOn } from "@/lib/oakFlags/contactCard";
import { getOakWorkspace } from "@/lib/oakWorkspace";
import { oakOpenUIProposals, type OakOpenUIProposal } from "../../../../packages/oak-agent-contracts/src/openui/prompt-options";
import { label, useScope, type OakOpenUIScope } from "../scope";

/** Proposals opened in this page's life, by answer and action; nothing is sent, so the receipt only needs to last the visit. */
const openedProposals = new Set<string>();

/** The pages this answer cites, by their own labels, once each and at most three, in the order the claims cite them. */
function proposalTopics(claims: OakOpenUIScope["claims"], cardOf: OakOpenUIScope["cardOf"]) {
  const pages = new Map<string, string>();
  for (const claim of claims.values()) {
    const source = cardOf?.(claim);
    if (source && !pages.has(source.page)) pages.set(source.page, source.title);
  }
  return [...new Set(pages.values())].slice(0, 3);
}

/** `label` is the model's offer; the card shows the app's own title for that tool instead, so it never states a fact. */
export function ProposalView({ action }: { action: OakOpenUIProposal; label: string }) {
  const { id, latest, proposal, proposalStep, renderProposalArt, renderContactCard, claims, cardOf } = useScope();
  const trigger = useTriggerAction();
  const key = `${id}:${action}`;
  const [opened, setOpened] = React.useState(() => openedProposals.has(key));
  const hintId = React.useId();
  const topicsId = React.useId();
  const receipt = React.useRef<HTMLParagraphElement>(null);
  const justOpened = React.useRef(false);
  // The tapped row is replaced by its receipt; if the opened tool did not take focus, the receipt holds it.
  React.useEffect(() => {
    if (!opened || !justOpened.current) return;
    justOpened.current = false;
    const frame = requestAnimationFrame(() => { if (document.activeElement === document.body) receipt.current?.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [opened]);
  const title = proposalStep?.title;
  if (!oakOpenUIProposals.includes(action) || action !== proposal || !title) return null;
  const conversationId = getOakWorkspace().conversationId;
  if (action === "prepareBrief" && renderContactCard && oakContactCardOn() && oakContactCardAllowed(conversationId, id)) return renderContactCard(conversationId);
  // R15 (Oak, review v12: "this UI doesn't make sense"): the proposal is the next-step card, one row you tap (the tool's
  // tile, its title and hint, a chevron), not a title over a lone "Open it" button. Opened, the row keeps its receipt.
  if (opened) return <div className="oak-proposal oak-openui__proposal" data-action={action} data-opened="">
    {renderProposalArt(action)}
    <div className="oak-proposal__body">
      <p className="oak-proposal__title">{title}</p>
      <p ref={receipt} tabIndex={-1} className="oak-proposal__receipt">Opened with your question. Nothing is sent until you send it.</p>
    </div>
  </div>;
  // Ticket 16: a brief can attach the pages this answer cited (its public references), so the card names them. The names are the
  // pages' own labels, never the model's words, and nothing is attached until the visitor ticks it in the brief.
  const topics = action === "prepareBrief" ? proposalTopics(claims, cardOf) : [];
  const text = <span className="oak-next-step__text">
    <span className="oak-next-step__title">{title}</span>
    <span id={hintId} className="oak-next-step__hint">{proposalStep.hint}</span>
    {topics.length ? <span id={topicsId} className="oak-next-step__topics">
      <span className="oak-next-step__topics-label">Pages from this answer<span className="sr-only">:</span></span>
      {topics.map((topic, index) => <span key={topic} className="oak-next-step__topic">{topic}{index < topics.length - 1 ? <span className="sr-only">,</span> : null}</span>)}
    </span> : null}
  </span>;
  // An older turn keeps the card's layout but is not a control: no button, no chevron, like its inactive pills.
  if (!latest) return <div className="oak-next-step oak-openui__proposal" data-action={action} data-inactive="">
    {renderProposalArt(action)}{text}
  </div>;
  return <button type="button" className="oak-next-step oak-openui__proposal" data-action={action} aria-label={title} aria-describedby={topics.length ? `${hintId} ${topicsId}` : hintId}
    onClick={() => { justOpened.current = true; openedProposals.add(key); setOpened(true); void trigger(title, undefined, { type: action }); }}>
    {renderProposalArt(action)}{text}
    <span className="oak-next-step__chevron" aria-hidden="true"><Icon name="chevronRight" size={16} /></span>
  </button>;
}

export const Proposal = defineComponent({
  name: "Proposal",
  description: "Offer one next step Oak can open with the visitor's question: compareRole (a job they have), prepareBrief (writing to Steve), openDocuments (a resume or job post they have), getAdvice (their own project). label is a 3 to 7 word offer. Opening never sends anything. At most one, last.",
  props: z.object({ action: z.enum(oakOpenUIProposals), label: label(60) }),
  component: ({ props }) => <ProposalView action={props.action} label={props.label} />,
});
