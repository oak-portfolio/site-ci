import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { Icon, type IconName } from "@/components/ui/Icon";
import { oakCalloutKinds, oakCalloutKindsOn } from "@/lib/oakFlags/calloutKinds";
import { oakRecordFactsState, useOakRecordFacts } from "@/lib/oakRecordFacts";
import type { AnswerClaim } from "../../../../packages/oak-agent-contracts/src/types";
import { Claim, claimId, SkelBar, useScope } from "../scope";

const KINDS = {
  held: { icon: "lock", word: "Not published yet" },
  now: { icon: "clock", word: "In progress" },
  off: { icon: "viewOff", word: "Off the record" },
  guard: { icon: "securityCheck", word: "Outside what I answer" },
} as const satisfies Record<string, { icon: IconName; word: string }>;
type Kind = keyof typeof KINDS;

/** A banner states a fact, so it shows only when the cited record backs it; guard speaks for the agent, not about Steve. */
function backed(kind: Kind, claim: AnswerClaim | undefined, revision: string) {
  if (!claim) return false;
  if (kind === "guard") return true;
  if (kind === "off") return claim.citations.length === 0;
  return claim.citations.some(citation => {
    const state = oakRecordFactsState(citation.documentId, revision);
    if (state.status !== "loaded") return false;
    return state.facts.kind === "work" ? state.facts.articleStatus === "in-progress-stub" : kind === "now" && state.facts.kind === "experience" && !state.facts.dateEnd;
  });
}

/** Ticket 17: a planned caveat's ghost, the callout's own frame and icon tile with its text lines as bars. */
export function CalloutGhost() {
  return <div className="oak-openui__callout oak-openui-skel" data-pending=""><span className="oak-openui__callout-icon oak-openui-skel__mark" />
    <span className="oak-openui__callout-text"><span className="oak-openui-ghost__line"><SkelBar size="long" /></span>
      <span className="oak-openui-ghost__line" data-narrow=""><SkelBar size="long" /></span><span className="oak-openui-ghost__line"><SkelBar /></span></span></div>;
}

const props = z.object({ claim: claimId, kind: z.enum(["held", "now", "off", "guard"]).optional() });

export const Callout = defineComponent({
  name: "Callout",
  description: "One claim the visitor must not miss, such as a limit or a caveat. At most one per answer.",
  // Ticket 238: the render library always parses kind; the look stays behind oakCalloutKindsOn().
  props,
  // Ticket 14: a caveat is a note in the reading flow, not a page landmark; the role names it and the icon stays decoration.
  component: ({ props }) => <CalloutView claim={props.claim} kind={oakCalloutKindsOn() ? props.kind : undefined} />,
});

/** The prompt library's Callout: the prompt and spec.json teach kind only once the constant flips. */
export const CalloutTaught = oakCalloutKinds ? Callout : defineComponent({ ...Callout, props: props.omit({ kind: true }) as unknown as typeof props });

function CalloutView({ claim, kind: asked }: { claim: string; kind?: Kind }) {
  const { claims, knowledgeRevision = "" } = useScope();
  useOakRecordFacts("", asked ? knowledgeRevision : "");
  const kind = asked && backed(asked, claims.get(claim), knowledgeRevision) ? asked : undefined;
  return <div className="oak-openui__callout" role="note" data-kind={kind}><span className="oak-openui__callout-icon" aria-hidden="true"><Icon name={kind ? KINDS[kind].icon : "info"} size={16} /></span>
    <span className="oak-openui__callout-text">{kind ? <span className="oak-openui__callout-kind">{KINDS[kind].word}</span> : null}<Claim id={claim} /></span></div>;
}
