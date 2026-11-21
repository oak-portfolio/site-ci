import * as React from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { OakFigure } from "../../figure/OakFigure";
import { OakOpenUIScopeContext, SkelBar } from "../../scope";
import { announceOakBlock } from "../../a11y/oakBlockAnnounce";

type Box = Readonly<{ x: number; y: number; width: number; height: number }>;
export type OakMindmapNode = Readonly<{ x: number; y: number; side: "start" | "end"; lines: readonly string[]; dot: Box; text: Box }>;
export type OakMindmapLayout = Readonly<{
  width: number; height: number; radial: boolean; chars: number;
  hub: Readonly<{ x: number; y: number; r: number }>; nodes: readonly OakMindmapNode[]; branches: readonly string[];
}>;

const DOT = 14, GAP = 8, ROW = 60, LINE = 18, CHAR = 7.6, RADIAL = 560;
const n1 = (value: number) => Math.round(value * 10) / 10;

/** Greedy word wrap into at most two lines of `chars`; a longer label keeps its tail on the second line. */
function wrap(label: string, chars: number): string[] {
  const lines: string[] = [];
  for (const word of label.split(" ")) {
    const last = lines.at(-1);
    if (last !== undefined && (last.length + 1 + word.length <= chars || lines.length === 2)) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

const curve = (sx: number, sy: number, ex: number, ey: number) => {
  const mid = sx + (ex - sx) / 2;
  return `M ${n1(sx)} ${n1(sy)} C ${n1(mid)} ${n1(sy)} ${n1(mid)} ${n1(ey)} ${n1(ex)} ${n1(ey)}`;
};

/**
 * Radial at 560px and wider: the cover hub at the centre, half the parts on each side along an ellipse, labels outside.
 * Narrower: the hub top-left and the parts down a spine below it, each branch curving off to its own dot.
 */
export function oakMindmapLayout(labels: readonly string[], width: number): OakMindmapLayout {
  const place = (x: number, y: number, side: "start" | "end", label: string, chars: number): OakMindmapNode => {
    const lines = wrap(label, chars), textWidth = Math.ceil(Math.max(...lines.map(line => line.length)) * CHAR), height = lines.length * LINE;
    const left = side === "end" ? x + DOT + GAP : x - DOT - GAP - textWidth;
    return { x, y, side, lines, dot: { x: x - DOT, y: y - DOT, width: 2 * DOT, height: 2 * DOT }, text: { x: left, y: y - height / 2, width: textWidth, height } };
  };
  if (width >= RADIAL) {
    const r = 56, right = Math.ceil(labels.length / 2), rows = Math.max(right, labels.length - right);
    const height = Math.max(rows * ROW, 2 * r + 32) + 16, cx = width / 2, cy = height / 2;
    const reach = Math.min(cx - 1 - DOT - GAP - 22 * CHAR, 220), floor = r + DOT + 24, half = cy + ROW / 2;
    const chars = Math.floor((cx - 1 - Math.max(reach, floor) - DOT - GAP) / CHAR);
    const nodes = labels.map((label, at) => {
      const side = at < right ? "end" : "start", index = at < right ? at : at - right, count = at < right ? right : labels.length - right;
      const y = cy + (index - (count - 1) / 2) * ROW, dy = y - cy;
      const offset = Math.max(floor, reach * Math.sqrt(Math.max(0, 1 - (dy / half) ** 2)));
      return place(side === "end" ? cx + offset : cx - offset, y, side, label, chars);
    });
    const branches = nodes.map(item => {
      const angle = Math.atan2(item.y - cy, item.x - cx);
      return curve(cx + r * Math.cos(angle), cy + r * Math.sin(angle), item.side === "end" ? item.x - DOT : item.x + DOT, item.y);
    });
    return { width: Math.floor(width), height, radial: true, chars, hub: { x: cx, y: cy, r }, nodes, branches };
  }
  const r = 40, cx = r + 1, cy = r + 1, top = 2 * r + 16, dotX = cx + 36;
  const chars = Math.floor((width - 1 - dotX - DOT - GAP) / CHAR);
  const nodes = labels.map((label, at) => place(dotX, top + ROW / 2 + at * ROW, "end", label, chars));
  const elbow = (from: number, item: OakMindmapNode) => `M ${n1(cx)} ${n1(from)} C ${n1(cx)} ${n1(item.y)} ${n1(cx)} ${n1(item.y)} ${n1(item.x - DOT)} ${n1(item.y)}`;
  const branches = nodes.map((item, at) => elbow(at ? nodes[at - 1]!.y : cy + r, item));
  return { width: Math.floor(width), height: top + labels.length * ROW, radial: false, chars, hub: { x: cx, y: cy, r }, nodes, branches };
}

export type OakDiagramPart = Readonly<{ label: string; description: string }>;

const KEYS: Readonly<Record<string, (at: number, last: number) => number>> = {
  ArrowRight: at => at + 1, ArrowDown: at => at + 1, ArrowLeft: at => at - 1, ArrowUp: at => at - 1, Home: () => 0, End: (_, last) => last,
};

/** The keyboard surface below an inert drawing: Back, Next, arrows, Home and End move the selection in order, and each move is said. */
export function DiagramPanel({ name, noun, steps, current, select }: { name: string; noun: string; steps: readonly OakDiagramPart[]; current: number; select: (at: number) => void }) {
  const step = steps[current]!, last = steps.length - 1;
  const count = `${noun[0]!.toUpperCase() + noun.slice(1)} ${current + 1} of ${steps.length}`;
  const block = `${React.useContext(OakOpenUIScopeContext)?.id ?? ""}:${React.useId()}`;
  const shown = React.useRef(current);
  // Only a selection move is said: the current step's text streaming in must stay quiet.
  React.useEffect(() => {
    if (shown.current === current) return;
    shown.current = current;
    announceOakBlock(block, `${count}. ${step.label}. ${step.description}`, { repeat: true });
  }, [current]);
  const onKeyDown = (event: React.KeyboardEvent) => {
    const to = KEYS[event.key];
    if (!to) return;
    event.preventDefault();
    select(to(current, last));
  };
  return <div className="oak-diagram__panel" role="group" aria-label={`${name}, ${noun} details`} onKeyDown={onKeyDown}>
    <div className="oak-diagram__panel-body">
      <p className="oak-diagram__panel-count">{count}</p>
      <h5 className="oak-diagram__panel-title">{step.label}</h5>
      <p className="oak-diagram__panel-text">{step.description}</p>
    </div>
    <div className="oak-diagram__panel-nav">
      <Button type="button" variant="ghost" size="icon" aria-label={`Previous ${noun}`} focusableWhenDisabled disabled={current === 0}
        onClick={() => select(current - 1)}><Icon name="arrowLeft" size={16} /></Button>
      <Button type="button" variant="ghost" size="icon" aria-label={`Next ${noun}`} focusableWhenDisabled disabled={current === last}
        onClick={() => select(current + 1)}><Icon name="arrowRight" size={16} /></Button>
    </div>
  </div>;
}

/** The drawing waits for its canvas width, then lays out once per width. */
export function useCanvasWidth() {
  const canvas = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
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
  return [canvas, width] as const;
}

export const DiagramWait = () => <span className="oak-diagram__ghost oak-openui-skel" data-pending=""><SkelBar size="long" /><SkelBar size="long" /><SkelBar /></span>;

/** The parts of one project around its cover: the selected branch and dot take the one accent, its text opens in the panel. */
export function DiagramMindmap({ name, cover, steps }: { name: string; cover: Readonly<{ src: string }>; steps: readonly OakDiagramPart[] }) {
  const [canvas, width] = useCanvasWidth();
  const [selected, setSelected] = React.useState(0);
  const clip = React.useId();
  const current = Math.min(selected, steps.length - 1);
  const select = (at: number) => setSelected(Math.max(0, Math.min(steps.length - 1, at)));
  const layout = React.useMemo(() => width ? oakMindmapLayout(steps.map(step => step.label), width) : null, [steps, width]);
  return <div className="oak-diagram" data-preset="mindmap">
    <OakFigure caption={`The parts of ${name}`} items={steps.map(item => ({ label: item.label, value: item.description }))}>
      <div ref={canvas} className="oak-diagram__canvas" data-fitted="">
        {layout ? <svg className="oak-diagram-map" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} data-radial={layout.radial ? "" : undefined}>
          <defs><clipPath id={clip}><circle cx={layout.hub.x} cy={layout.hub.y} r={layout.hub.r} /></clipPath></defs>
          {layout.branches.map((d, at) => <path key={at} d={d} className="oak-diagram-map__branch" data-selected={at === current ? "" : undefined} />)}
          <foreignObject x={layout.hub.x - layout.hub.r} y={layout.hub.y - layout.hub.r} width={2 * layout.hub.r} height={2 * layout.hub.r} clipPath={`url(#${clip})`}>
            <img className="oak-diagram-map__cover" src={cover.src} alt="" />
          </foreignObject>
          <circle className="oak-diagram-map__hub" cx={layout.hub.x} cy={layout.hub.y} r={layout.hub.r} />
          {layout.nodes.map((item, at) => <g key={at} className="oak-diagram-map__node" data-selected={at === current ? "" : undefined} onClick={() => select(at)}>
            <circle cx={item.x} cy={item.y} r={DOT} />
            <text className="oak-diagram-map__num" x={item.x} y={item.y} textAnchor="middle" dominantBaseline="central">{at + 1}</text>
            <text className="oak-diagram-map__label" x={item.side === "end" ? item.text.x : item.text.x + item.text.width} textAnchor={item.side === "end" ? "start" : "end"}>
              {item.lines.map((line, row) => <tspan key={row} x={item.side === "end" ? item.text.x : item.text.x + item.text.width} y={item.text.y + row * LINE + 13}>{line}</tspan>)}
            </text>
          </g>)}
        </svg> : <DiagramWait />}
      </div>
    </OakFigure>
    <DiagramPanel name={name} noun="part" steps={steps} current={current} select={select} />
  </div>;
}
