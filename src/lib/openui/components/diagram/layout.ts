import { oakGraphLayout, type OakGraphLayout, type OakGraphPoint, type OakGraphStep } from "../../layout/oakGraphLayout";
import { oakDiagramView, type OakDiagramDrawn, type OakDiagramView } from "../../../../../packages/oak-agent-contracts/src/openui/views/diagram";

export type OakDiagramLayout = OakGraphLayout & OakDiagramView;

const flip = ({ x, y }: OakGraphPoint) => ({ x: y, y: x });

/** The preset's view laid out by the shared dagre helper (TB only), so a row (LR) is its column laid out on swapped axes. `fit` is the measured height the tallest label needs. */
export async function oakDiagramLayout(steps: readonly OakGraphStep[], preset: OakDiagramDrawn, width: number, fit = 0): Promise<OakDiagramLayout> {
  const sized = oakDiagramView(steps.length, preset, width);
  const view = { ...sized, nodeHeight: Math.max(sized.nodeHeight, fit) };
  if (view.direction === "TB") return { ...view, ...(await oakGraphLayout(steps, view)) };
  const turned = await oakGraphLayout(steps, { nodeWidth: view.nodeHeight, nodeHeight: view.nodeWidth, gap: view.gap });
  return {
    ...view,
    width: turned.height,
    height: turned.width,
    nodes: turned.nodes.map(node => ({ label: node.label, x: node.y, y: node.x, width: node.height, height: node.width })),
    edges: turned.edges.map(edge => ({ ...edge, points: edge.points.map(flip) })),
  };
}
