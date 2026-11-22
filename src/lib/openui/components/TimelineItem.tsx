import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { Icon } from "@/components/ui/Icon";
import { Claim, claimId, label } from "../scope";

// Ticket 250: the sentence states its own date, so the item is the sentence on its rail node; date only orders the items.
function TimelineItemView({ claim: id }: { claim: string }) {
  return <li className="oak-openui__timeline-item">
    {/* v3 review: each item hangs on a node of one vertical rail. */}
    <span className="oak-openui__timeline-node" aria-hidden="true"><Icon name="calendar" size={12} /></span>
    <span className="oak-openui__timeline-claim"><Claim id={id} /></span>
  </li>;
}

export const TimelineItem = defineComponent({
  name: "TimelineItem",
  description: "One dated claim. date is copied exactly as the claim writes it (\"2023\", \"March 2024\").",
  props: z.object({ date: label(24), claim: claimId }),
  component: ({ props }) => <TimelineItemView claim={props.claim} />,
});
