import { OakFigure } from "../../figure/OakFigure";
import { DiagramWait, useCanvasWidth } from "./mindmap";
import type { OakDiagramRecord } from "./radar";

export const OAK_QUADRANT_AXES = { x: "Published artifacts (count)", y: "Case study status" } as const;

const H = 280, LEFT = 56, TOP = 16, BOTTOM = 232, MID = (TOP + BOTTOM) / 2, CLEAR = 12, NEAR = 96, GAP = 12, ROW = 18, DOT = 6;
export const oakChartTextWidth = (text: string) => Math.ceil(text.length * 7.4);
type Box = Readonly<{ x0: number; x1: number; y0: number; y1: number }>;
const meets = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Across is the record's published artifact count (0 to the largest), up is a full case study; close dots in a band stagger,
 * and a name whose box would meet an earlier one moves a row up or down, tied to its dot by a leader line.
 */
export function oakQuadrantPlace(records: readonly OakDiagramRecord[], width = 420) {
  const right = width - 16;
  const top = Math.max(1, ...records.map(record => record.facts.artifacts.length));
  const placed = records.map(({ facts }) => {
    const count = facts.artifacts.length, full = facts.articleStatus === "full";
    return { count, full, x: Math.round(LEFT + CLEAR + (count / top) * (right - LEFT - 2 * CLEAR)), y: full ? (TOP + MID) / 2 : (MID + BOTTOM) / 2 };
  });
  const taken: Box[] = [];
  return placed.map((place, at) => {
    const crowd = placed.slice(0, at).filter(other => other.full === place.full && Math.abs(other.x - place.x) < NEAR).length;
    const [low, high] = place.full ? [TOP + DOT, MID - DOT] : [MID + DOT, BOTTOM - DOT];
    const y = Math.min(high, Math.max(low, place.y + (crowd % 2 ? 22 : crowd ? -22 : 0) * Math.ceil(crowd / 2)));
    const text = oakChartTextWidth(records[at]!.name), end = place.x + GAP + text > right;
    const x = end ? place.x - GAP : place.x + GAP, x0 = end ? x - text : x;
    const boxAt = (base: number): Box => ({ x0, x1: x0 + text, y0: base - 13, y1: base + 4 });
    let base = y + 5;
    for (let step = 1; step < 12 && taken.some(other => meets(other, boxAt(base))); step++) base = y + 5 + (step % 2 ? 1 : -1) * Math.ceil(step / 2) * ROW;
    taken.push(boxAt(base));
    return { ...place, y, label: { x, y: base, anchor: end ? "end" as const : "start" as const, width: text } };
  });
}

/** The cited projects on two axes that say what they count; the one accent marks every dot, its name beside it. */
export function DiagramQuadrant({ records }: { records: readonly OakDiagramRecord[] }) {
  const [canvas, width] = useCanvasWidth();
  const places = oakQuadrantPlace(records, width || 420);
  const right = (width || 420) - 16;
  const top = Math.max(1, ...places.map(place => place.count));
  return <div className="oak-diagram" data-preset="quadrant">
    <OakFigure caption={`Published proof and case study status: ${records.map(record => record.name).join(", ")}`}
      items={records.map((record, at) => ({ label: record.name, value: `${places[at]!.count} published artifacts, ${places[at]!.full ? "full case study" : "case study in progress"}` }))}>
      <div ref={canvas} className="oak-diagram-chart">
        {width ? <svg className="oak-diagram-chart__svg" width={width} height={H} viewBox={`0 0 ${width} ${H}`}>
          <rect className="oak-diagram-chart__plot" x={LEFT} y={TOP} width={right - LEFT} height={BOTTOM - TOP} />
          <line className="oak-diagram-chart__divide" x1={LEFT} y1={MID} x2={right} y2={MID} />
          <line className="oak-diagram-chart__divide" data-dashed="" x1={(LEFT + right) / 2} y1={TOP} x2={(LEFT + right) / 2} y2={BOTTOM} />
          <text className="oak-diagram-chart__band" x={LEFT + 8} y={TOP + 18}>Full case study</text>
          <text className="oak-diagram-chart__band" x={LEFT + 8} y={MID + 18}>In progress</text>
          <text className="oak-diagram-chart__tick" x={LEFT} y={BOTTOM + 16} textAnchor="start">0</text>
          <text className="oak-diagram-chart__tick" x={right} y={BOTTOM + 16} textAnchor="end">{top}</text>
          <text className="oak-diagram-chart__axis" x={(LEFT + right) / 2} y={H - 10} textAnchor="middle">{OAK_QUADRANT_AXES.x}</text>
          <text className="oak-diagram-chart__axis" x={18} y={(TOP + BOTTOM) / 2} textAnchor="middle" transform={`rotate(-90 18 ${(TOP + BOTTOM) / 2})`}>{OAK_QUADRANT_AXES.y}</text>
          {places.map((place, at) => <g key={at} className="oak-diagram-chart__point">
            {place.label.y !== place.y + 5 ? <line className="oak-diagram-chart__leader" x1={place.x} y1={place.y} x2={place.label.anchor === "end" ? place.label.x + 4 : place.label.x - 4} y2={place.label.y - 4} /> : null}
            <circle cx={place.x} cy={place.y} r={DOT} />
            <text className="oak-diagram-chart__name" x={place.label.x} y={place.label.y} textAnchor={place.label.anchor}>{records[at]!.name}</text>
          </g>)}
        </svg> : <DiagramWait />}
      </div>
    </OakFigure>
  </div>;
}
