import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import type { AnswerClaim } from "../../../../packages/oak-agent-contracts/src/types";
import { oakStackChips } from "../../../../packages/oak-agent-contracts/src/openui/views/stack";
import { ToolChip } from "../cards";
import { useScope, type OakOpenUIScope } from "../scope";

/** The tools the cited pages list that some claim names, in the pages' order, once each. */
export const oakOpenUIStack = (claims: readonly AnswerClaim[], cardOf: OakOpenUIScope["cardOf"]) =>
  oakStackChips(claims, cardOf && (claim => cardOf(claim as AnswerClaim)));

function StackView() {
  const { claims, cardOf } = useScope();
  const items = oakOpenUIStack([...claims.values()], cardOf);
  if (items.length < 2) return null;
  return <ul className="oak-openui-chips oak-openui-stack" aria-label="Tools named in this answer">
    {items.map(item => <ToolChip key={item} item={item} />)}</ul>;
}

export const Stack = defineComponent({
  name: "Stack",
  description: "Chips of the tools the cited pages list that the claims name. Takes no props; shows nothing under 2 matches.",
  props: z.object({}),
  component: () => <StackView />,
});
