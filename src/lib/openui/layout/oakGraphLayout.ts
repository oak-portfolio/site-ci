export type OakGraphStep = Readonly<{ label: string; description?: string }>;
export type OakGraphPoint = Readonly<{ x: number; y: number }>;
export type OakGraphNode = Readonly<{ label: string; x: number; y: number; width: number; height: number }>;
export type OakGraphEdge = Readonly<{ from: number; to: number; points: readonly OakGraphPoint[] }>;
export type OakGraphLayout = Readonly<{ width: number; height: number; nodes: readonly OakGraphNode[]; edges: readonly OakGraphEdge[] }>;

export type OakGraphLayoutOptions = Readonly<{ nodeWidth?: number; nodeHeight?: number; gap?: number }>;

export async function oakGraphLayout(steps: readonly OakGraphStep[], { nodeWidth = 176, nodeHeight = 56, gap = 32 }: OakGraphLayoutOptions = {}): Promise<OakGraphLayout> {
  const { graphlib, layout } = await import("@dagrejs/dagre");
  const graph = new graphlib.Graph();
  graph.setGraph({ rankdir: "TB", nodesep: gap, ranksep: gap, marginx: 1, marginy: 1 });
  graph.setDefaultEdgeLabel(() => ({}));
  steps.forEach((_, index) => graph.setNode(String(index), { width: nodeWidth, height: nodeHeight }));
  steps.slice(1).forEach((_, index) => graph.setEdge(String(index), String(index + 1)));
  layout(graph);
  const { width = 0, height = 0 } = graph.graph();
  return {
    width,
    height,
    nodes: steps.map((step, index) => {
      const { x, y } = graph.node(String(index));
      return { label: step.label, x: x - nodeWidth / 2, y: y - nodeHeight / 2, width: nodeWidth, height: nodeHeight };
    }),
    edges: steps.slice(1).map((_, index) => ({
      from: index,
      to: index + 1,
      points: (graph.edge(String(index), String(index + 1)).points as OakGraphPoint[]).map(({ x, y }) => ({ x, y })),
    })),
  };
}
