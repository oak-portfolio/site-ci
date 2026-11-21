import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { Icon } from "@/components/ui/Icon";
import { OAK_DATE_OPENING_WORDS, oakOpenUIRepeats } from "../../../../packages/oak-agent-contracts/src/openui/verdict";
import { Claim, claimId, label, oakVerbatim, useScope } from "../scope";

function TimelineItemView({ date, claim: id }: { date: string; claim: string }) {
  const { claims } = useScope();
  const claim = claims.get(id);
  const shown = oakVerbatim(claim, date) && !oakOpenUIRepeats(claim?.text ?? "", date, OAK_DATE_OPENING_WORDS);
  return <li className="oak-openui__timeline-item" data-dated={shown ? "" : undefined}>
    {/* v3 review: each item hangs on a node of one vertical rail, and its date reads as a small calendar tag. */}
    <span className="oak-openui__timeline-node" aria-hidden="true"><Icon name="calendar" size={12} /></span>
    {shown ? <span className="oak-openui__timeline-date">{date.trim()}</span> : null}
    <span className="oak-openui__timeline-claim"><Claim id={id} /></span>
  </li>;
}

export const TimelineItem = defineComponent({
  name: "TimelineItem",
  description: "One dated claim. date is copied exactly as the claim writes it (\"2023\", \"March 2024\").",
  props: z.object({ date: label(24), claim: claimId }),
  component: ({ props }) => <TimelineItemView date={props.date} claim={props.claim} />,
});
