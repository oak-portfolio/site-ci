import * as React from "react";
import { Icon } from "@/components/ui/Icon";
import { oakExplainerTopic } from "@/data/oakExplainerTopics";
import { oakDrawnSpec } from "../explainer/drawnSpec";
import { Concept } from "./explainer/concept";
import { DrawnDiagram } from "./explainer/drawn";
import { StateDiag } from "./explainer/statediag";
import { TopicMap } from "./explainer/topicMap";
import { XEmb } from "./explainer/xemb";
import { XEval } from "./explainer/xeval";
import { XGrad } from "./explainer/xgrad";
import { XOffSteps } from "./explainer/xoffsteps";
import { XRag } from "./explainer/xrag";
import { XTool } from "./explainer/xtool";
import { ExplainerOff, oakExplainerDrawn, type ExplainerProps } from "./Explainer";

const PRESET_VIEWS = { xrag: XRag, xemb: XEmb, xtool: XTool, statediag: StateDiag, xeval: XEval, xgrad: XGrad, xoffsteps: XOffSteps } as const;

/** The labeled shell: the visible label is part of the block's accessible name, and Steve's work appears only in the Bridge line. */
export default function ExplainerView({ topic, preset, spec }: ExplainerProps) {
  const id = React.useId();
  const row = oakExplainerTopic(topic);
  const drawn = oakExplainerDrawn(preset);
  const titleId = `${id}-title`;
  const written = drawn === "drawn" || drawn === "mermaid" ? oakDrawnSpec(drawn, spec) : null;
  if ((drawn === "drawn" || drawn === "mermaid") && !written) return <ExplainerOff topic={topic} />;
  return <section className="oak-explainer" data-preset={drawn} aria-labelledby={`${id}-label ${id}-title`}>
    <p id={`${id}-label`} className="oak-explainer__label"><Icon name="sparkles" size={14} />Drawn by Oak AI</p>
    {written ? <DrawnDiagram spec={written} topic={row} titleId={titleId} />
      : drawn === "xmap" ? <TopicMap selected={row.id} titleId={titleId} />
      : drawn === "concept" ? <Concept topic={row} titleId={titleId} />
      : React.createElement(PRESET_VIEWS[drawn as keyof typeof PRESET_VIEWS], { titleId })}
  </section>;
}
