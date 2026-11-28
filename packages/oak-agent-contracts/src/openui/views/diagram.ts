/** Ticket 44: every Diagram preset the model may name; only the ones a fragment teaches are drawn as themselves. */
export const OAK_DIAGRAM_PRESETS = ['flow', 'layers', 'blockdiag', 'swimlanes', 'agentflow', 'mindmap', 'treeview', 'radar', 'quadrant'] as const;
export type OakDiagramPreset = (typeof OAK_DIAGRAM_PRESETS)[number];
export type OakDiagramDrawn = 'flow' | 'layers' | 'blockdiag';
/** Ticket 45: presets drawn from a record's own fields; radar and quadrant compare two or more cited records. */
export const OAK_DIAGRAM_RECORD_PRESETS = ['mindmap', 'treeview', 'radar', 'quadrant'] as const;
export type OakDiagramRecordPreset = (typeof OAK_DIAGRAM_RECORD_PRESETS)[number];
export type OakDiagramView = Readonly<{ direction: 'LR' | 'TB'; nodeWidth: number; nodeHeight: number; gap: number }>;

/** One renderer, a sizing table per preset: a row runs across (LR) while each node keeps `min`, else the steps stack (TB). */
export const OAK_DIAGRAM_SIZES: Readonly<Record<OakDiagramDrawn, Readonly<{ min: number; max: number; height: number; gap: number; across: boolean; band: boolean }>>> = {
  flow: { min: 88, max: 176, height: 64, gap: 32, across: true, band: false },
  layers: { min: 0, max: 0, height: 56, gap: 12, across: false, band: true },
  blockdiag: { min: 120, max: 200, height: 104, gap: 24, across: true, band: false },
};

/** Direction and node size for `count` steps in a drawing `width` px wide; the canvas (dagre adds a 1px margin) never exceeds it. */
export function oakDiagramView(count: number, preset: OakDiagramDrawn, width: number): OakDiagramView {
  const size = OAK_DIAGRAM_SIZES[preset];
  const across = Math.floor((width - 2 - size.gap * (count - 1)) / Math.max(count, 1));
  if (size.across && across >= size.min) return { direction: 'LR', nodeWidth: Math.min(size.max, across), nodeHeight: size.height, gap: size.gap };
  return { direction: 'TB', nodeWidth: size.band ? width - 2 : Math.min(width - 2, 280), nodeHeight: size.height, gap: size.gap };
}

export type OakDiagramStep = Readonly<{ label: string; description?: string }>;
