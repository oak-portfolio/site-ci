import { OakFigure } from "../../figure/OakFigure";
import type { OakDiagramPart } from "./mindmap";

/** One project as an outline: its name at the root, each part a branch with its line, joined by hairline connectors. */
export function DiagramTreeview({ name, steps }: { name: string; steps: readonly OakDiagramPart[] }) {
  return <div className="oak-diagram" data-preset="treeview">
    <OakFigure caption={`The parts of ${name}`} items={steps.map(item => ({ label: item.label, value: item.description }))}>
      <div className="oak-diagram-tree">
        <p className="oak-diagram-tree__root">{name}</p>
        <ul className="oak-diagram-tree__parts">
          {steps.map((step, at) => <li key={at} className="oak-diagram-tree__part">
            <span className="oak-diagram-tree__label">{step.label}</span>
            <span className="oak-diagram-tree__text">{step.description}</span>
          </li>)}
        </ul>
      </div>
    </OakFigure>
  </div>;
}
