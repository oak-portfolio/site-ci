import * as React from "react";
import type { OakExplainerTopic } from "@/data/oakExplainerTopics";
import { OAK_DRAWN_CAPTIONS, type OakDrawnSpec } from "../../explainer/drawnSpec";
import { OakFigure } from "../../figure/OakFigure";
import { ExplainerBridge } from "./bridge";
import { MermaidFigure } from "./mermaid";

/** The model's validated spec under the shell's "Drawn by Oak AI" label: its title, the drawing with its text equivalent, the Bridge line. */
export function DrawnDiagram({ spec, topic, titleId }: { spec: OakDrawnSpec; topic: OakExplainerTopic; titleId: string }) {
  return <>
    <h3 id={titleId} className="oak-explainer__title">{spec.title}</h3>
    <OakFigure caption={OAK_DRAWN_CAPTIONS[spec.type]} items={spec.items} frame><MermaidFigure spec={spec} label={OAK_DRAWN_CAPTIONS[spec.type]} /></OakFigure>
    <ExplainerBridge topic={topic} />
  </>;
}
