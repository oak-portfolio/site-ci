import type { OakWorkFacts } from "@/lib/oakRecordFacts";
import { OakFigure } from "../../figure/OakFigure";
import { DiagramWait, useCanvasWidth } from "./mindmap";

export type OakDiagramRecord = Readonly<{ name: string; facts: OakWorkFacts }>;

/** Every spoke counts something the reviewed record publishes; nothing held, nothing scored by hand. */
export const OAK_RADAR_AXES = [
  { label: "System map steps", count: (facts: OakWorkFacts) => facts.systemMap.length },
  { label: "Published artifacts", count: (facts: OakWorkFacts) => facts.artifacts.length },
  { label: "Metrics", count: (facts: OakWorkFacts) => facts.metrics.length },
  { label: "Case study sections", count: (facts: OakWorkFacts) => facts.sections.length },
] as const;

export const oakRadarCounts = (facts: OakWorkFacts) => OAK_RADAR_AXES.map(axis => axis.count(facts));

const LINE = 15, PAD = 10, SERIES = 3;
const n1 = (value: number) => Math.round(value * 10) / 10;
const halves = (label: string) => { const words = label.split(" "), cut = Math.ceil(words.length / 2); return [words.slice(0, cut).join(" "), words.slice(cut).join(" ")]; };
const anchors = ["middle", "start", "middle", "end"] as const;
const textWidth = (text: string) => Math.ceil(text.length * 7.4);

/** The radar in real pixels for a column `width` wide: the side labels keep their room and the radius takes the rest. */
export function oakRadarLayout(counts: readonly (readonly number[])[], width: number) {
  const shown = counts.slice(0, SERIES);
  const max = OAK_RADAR_AXES.map((_, axis) => Math.max(1, ...shown.map(row => row[axis]!)));
  const lines = OAK_RADAR_AXES.map((axis, index) => [...halves(axis.label), shown.map(row => row[index]).join(" \u00b7 ")]);
  const wide = lines.map(group => Math.max(...group.map(textWidth)));
  const r = Math.max(24, Math.min(120, Math.floor(width / 2 - Math.max(wide[1]!, wide[3]!) - 2 * PAD)));
  const cx = Math.round(width / 2), cy = Math.round(PAD + LINE * lines[0]!.length + r);
  const at = (axis: number, scale: number) => {
    const angle = -Math.PI / 2 + (axis * 2 * Math.PI) / OAK_RADAR_AXES.length;
    return { x: n1(cx + r * scale * Math.cos(angle)), y: n1(cy + r * scale * Math.sin(angle)) };
  };
  const points = (scales: readonly number[]) => scales.map((scale, axis) => { const p = at(axis, scale); return `${p.x},${p.y}`; }).join(" ");
  const labels = lines.map((group, index) => {
    const end = at(index, 1), off = [{ x: 0, y: -8 }, { x: 8, y: 0 }, { x: 0, y: 8 }, { x: -8, y: 0 }][index]!;
    const top = index === 0 ? end.y + off.y - LINE * (group.length - 1) - 4 : index === 2 ? end.y + off.y + 12 : end.y - LINE * (group.length - 1) / 2 + 4;
    return { x: end.x + off.x, y: n1(top), anchor: anchors[index]!, width: wide[index]!, lines: group };
  });
  return {
    width, height: Math.round(cy + r + 12 + LINE * lines[2]!.length + PAD), cx, cy,
    rings: [1 / 3, 2 / 3, 1].map(scale => points(OAK_RADAR_AXES.map(() => scale))),
    spokes: OAK_RADAR_AXES.map((_, index) => at(index, 1)),
    shapes: shown.map(row => points(row.map((value, axis) => value / max[axis]!))),
    labels,
  };
}

/**
 * Two or three cited projects compared spoke by spoke, each spoke scaled to the largest count among them. The first project
 * is the one accent (solid), the second dashed, the third dotted, so color is never the only key.
 * shortcut: three projects at most; a fourth shape makes the drawing unreadable, so the list carries the rest.
 */
export function DiagramRadar({ records }: { records: readonly OakDiagramRecord[] }) {
  const [canvas, width] = useCanvasWidth();
  const counts = records.map(record => oakRadarCounts(record.facts));
  const names = records.map(record => record.name);
  const layout = width ? oakRadarLayout(counts, width) : null;
  return <div className="oak-diagram" data-preset="radar">
    <OakFigure caption={`What the records publish: ${names.join(", ")}`}
      items={records.map((record, row) => ({ label: record.name, value: OAK_RADAR_AXES.map((axis, index) => `${axis.label}: ${counts[row]![index]}`).join(", ") }))}>
      <div ref={canvas} className="oak-diagram-chart">
        <ul className="oak-figure__legend">{names.slice(0, SERIES).map((name, row) => <li key={row}>
          <span className="oak-diagram-chart__key" data-series={row + 1} />{name}</li>)}</ul>
        {layout ? <svg className="oak-diagram-chart__svg" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
          {layout.rings.map((points, ring) => <polygon key={ring} className="oak-diagram-chart__ring" points={points} />)}
          {layout.labels.map((label, index) => <g key={OAK_RADAR_AXES[index]!.label}>
            <line className="oak-diagram-chart__spoke" x1={layout.cx} y1={layout.cy} x2={layout.spokes[index]!.x} y2={layout.spokes[index]!.y} />
            <text className="oak-diagram-chart__axis" textAnchor={label.anchor}>{label.lines.map((line, row) => <tspan key={row} x={label.x} y={n1(label.y + row * LINE)}
              className={row === label.lines.length - 1 ? "oak-diagram-chart__count" : undefined}>{line}</tspan>)}</text>
          </g>)}
          {layout.shapes.map((points, series) => <polygon key={series} className="oak-diagram-chart__shape" data-series={series + 1} points={points} />)}
        </svg> : <DiagramWait />}
        <p className="oak-diagram-chart__note">Each spoke counts items in the record, scaled to the largest count shown.</p>
      </div>
    </OakFigure>
  </div>;
}
