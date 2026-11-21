import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { OAK_EXPLAINER_TOPIC_IDS, oakExplainerTopic } from "@/data/oakExplainerTopics";
import { oakExplainerBlockOn, oakExplainerPresetsForced } from "@/lib/oakFlags/explainer";
import { oakDrawnDiagramsOn } from "@/lib/oakFlags/drawnDiagrams";
import { OAK_OPENUI_BLOCKS } from "../../../../packages/oak-agent-contracts/src/openui/blocks.generated";
import { oakLazyView } from "../figure/oakLazyView";
import { SkelBar } from "../scope";

export const OAK_EXPLAINER_PRESETS = ["concept", "xmap", "xrag", "xemb", "xtool", "statediag", "xeval", "xgrad", "xoffsteps", "drawn", "mermaid"] as const;
export type OakExplainerPreset = (typeof OAK_EXPLAINER_PRESETS)[number];
export type ExplainerProps = { topic: string; preset?: OakExplainerPreset; spec?: string };
const MODEL_WRITTEN: readonly string[] = ["drawn", "mermaid"];

/** A preset the fragment does not teach draws as concept (presets are gated by `taughtPresets`, never flagged one by one). */
export const oakExplainerDrawn = (preset?: string): OakExplainerPreset =>
  preset && (oakExplainerPresetsForced() ?? OAK_OPENUI_BLOCKS.Explainer?.taughtPresets ?? []).includes(preset)
    && (!MODEL_WRITTEN.includes(preset) || oakDrawnDiagramsOn())
    && (OAK_EXPLAINER_PRESETS as readonly string[]).includes(preset) ? preset as OakExplainerPreset : "concept";

export function ExplainerGhost() {
  return <div className="oak-explainer oak-openui-skel" data-pending="" aria-hidden="true">
    <span className="oak-explainer__ghost"><SkelBar size="short" /><SkelBar size="long" /><SkelBar size="long" /><SkelBar /></span>
  </div>;
}

export const ExplainerOff = ({ topic }: ExplainerProps) => <p className="oak-openui__prose">{oakExplainerTopic(topic).summary}</p>;
const Lazy = oakLazyView<ExplainerProps>(() => import("./ExplainerView"), ExplainerGhost, ExplainerOff);
const ExplainerBlock = (props: ExplainerProps) => oakExplainerBlockOn()
  ? <Lazy topic={props.topic} preset={props.preset} spec={props.spec} /> : <ExplainerOff topic={props.topic} />;

export const Explainer = defineComponent({
  name: "Explainer",
  description: "A general topic that is not about Steve, for a question like \"what is RAG?\" or \"explain embeddings simply\": the app draws a reviewed explainer, labeled as drawn by Oak AI, and links Steve's related work. topic: rag, embeddings, tool-calling, agent-memory, voice-agents, multi-agent or image-classification. preset: concept (default, the topic in steps) or xmap (every topic and the work that uses it, this topic selected). A question about Steve's own projects, roles or timeline keeps its usual blocks.",
  props: z.object({ topic: z.enum(OAK_EXPLAINER_TOPIC_IDS), preset: z.enum(OAK_EXPLAINER_PRESETS).optional(), spec: z.string().optional() }),
  component: ({ props }) => <ExplainerBlock topic={props.topic} preset={props.preset} spec={props.spec} />,
});
