import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { useScope } from "../scope";

function SourcesView() {
  return <>{useScope().renderSources()}</>;
}

export const Sources = defineComponent({
  name: "Sources",
  description: "The answer's sources button. Place it after the last claim block, before Pills or Proposal.",
  props: z.object({}),
  component: () => <SourcesView />,
});
