import * as React from "react";
import { OakFigure } from "../../figure/OakFigure";
import { SkelBar } from "../../scope";
import type { OakDiagramDrawn } from "../../../../../packages/oak-agent-contracts/src/openui/views/diagram";
import { oakDiagramLayout, type OakDiagramLayout } from "./layout";
import { DiagramPanel } from "./mindmap";

export type OakDiagramStep = Readonly<{ label: string; description: string }>;

type Box = Readonly<{ x: number; y: number; w: number; h: number }>;

/** An edge is straight (the steps form one chain), so its dagre points span a box whose far end sits on the next node. */
const boxOf = (points: readonly Readonly<{ x: number; y: number }>[]): Box => {
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

const Stage = ({ box, children }: { box: Box; children: React.ReactNode }) => <div className="oak-diagram__stage"
  style={{ "--oak-diagram-x": box.x, "--oak-diagram-y": box.y, "--oak-diagram-w": box.w, "--oak-diagram-h": box.h } as React.CSSProperties}>{children}</div>;
const Edge = ({ box }: { box: Box }) => <span className="oak-diagram__edge"
  style={{ "--oak-diagram-x": box.x, "--oak-diagram-y": box.y, "--oak-diagram-w": box.w, "--oak-diagram-h": box.h } as React.CSSProperties} />;
const Node = ({ box, selected, onSelect, children }: { box: Box; selected: boolean; onSelect: () => void; children: React.ReactNode }) => <div className="oak-diagram__node"
  data-selected={selected ? "" : undefined} onClick={onSelect}
  style={{ "--oak-diagram-x": box.x, "--oak-diagram-y": box.y, "--oak-diagram-w": box.w, "--oak-diagram-h": box.h } as React.CSSProperties}>{children}</div>;

/** The border-box height a node needs for its content: its children, the gaps between them, its padding and border. */
const neededHeight = (node: Element) => {
  const style = getComputedStyle(node), children = [...node.children];
  const content = children.reduce((sum, child) => sum + child.getBoundingClientRect().height, 0) + (parseFloat(style.rowGap) || 0) * Math.max(children.length - 1, 0);
  return Math.ceil(content + ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"].reduce((sum, key) => sum + parseFloat(style[key as "paddingTop"]), 0));
};

/**
 * The drawing is inert (OakFigure hides it from assistive tech; its list is the text equivalent), so nothing in it takes
 * focus. The detail panel below is the keyboard surface: Back, Next, arrows, Home and End move the selection in order.
 * Nodes grow to fit their wrapped labels: after each draw the tallest node's content is measured and, when it exceeds the
 * node, dagre lays the steps out again at that height so nothing overlaps.
 */
export function DiagramFigure({ name, steps, preset }: { name: string; steps: readonly OakDiagramStep[]; preset: OakDiagramDrawn }) {
  const canvas = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  const [layout, setLayout] = React.useState<OakDiagramLayout | null>(null);
  const [fit, setFit] = React.useState({ width: 0, height: 0 });
  const [fitted, setFitted] = React.useState(false);
  const [selected, setSelected] = React.useState(0);
  const last = steps.length - 1;
  const current = Math.min(selected, last);
  const select = (at: number) => setSelected(Math.max(0, Math.min(last, at)));
  const fitHeight = fit.width === width ? fit.height : 0;

  React.useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const read = () => setWidth(Math.floor(node.clientWidth));
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  React.useEffect(() => {
    if (!width) return;
    let live = true;
    void oakDiagramLayout(steps, preset, width, fitHeight).then(next => { if (live) setLayout(next); });
    return () => { live = false; };
  }, [steps, preset, width, fitHeight]);
  React.useLayoutEffect(() => {
    const nodes = canvas.current?.querySelectorAll(".oak-diagram__node");
    if (!layout || !nodes?.length) return;
    const need = Math.max(...[...nodes].map(neededHeight));
    setFitted(need <= layout.nodeHeight);
    if (need > layout.nodeHeight) setFit({ width, height: need });
  }, [layout]);

  return <div className="oak-diagram" data-preset={preset}>
    <OakFigure caption={`How ${name} works`} items={steps.map(item => ({ label: item.label, value: item.description }))}>
      <div ref={canvas} className="oak-diagram__canvas" data-direction={layout?.direction} data-fitted={fitted ? "" : undefined}>
        {layout ? <Stage box={{ x: 0, y: 0, w: layout.width, h: layout.height }}>
          {layout.edges.map(edge => <Edge key={edge.to} box={boxOf(edge.points)} />)}
          {layout.nodes.map((node, index) => <Node key={index} box={{ x: node.x, y: node.y, w: node.width, h: node.height }}
            selected={index === current} onSelect={() => select(index)}>
            <span className="oak-diagram__label">{node.label}</span>
            {preset === "blockdiag" ? <span className="oak-diagram__text">{steps[index]!.description}</span> : null}
          </Node>)}
        </Stage> : <span className="oak-diagram__ghost oak-openui-skel" data-pending=""><SkelBar size="long" /><SkelBar size="long" /><SkelBar /></span>}
      </div>
    </OakFigure>
    <DiagramPanel name={name} noun="step" steps={steps} current={current} select={select} />
  </div>;
}
