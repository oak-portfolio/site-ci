/** Ticket 40: EvidenceChart's shapes. A row carries a cited record's published artifact labels and only a count of its held ones. */
export type OakEvidenceMode = 'proof' | 'donut' | 'sankey';
export type OakEvidenceStatus = 'published' | 'held';
export type OakEvidenceRow = Readonly<{ document: string; name: string; published: readonly string[]; held?: number }>;
export type OakEvidenceTotals = Readonly<{ published: number; held: number; total: number; counted: boolean }>;

/** Sankey rows: each record node is ROW tall with GAP between, the same numbers the stylesheet lays its labels out with. */
export const OAK_EVIDENCE_ROW = 44;
export const OAK_EVIDENCE_GAP = 8;

const round = (value: number) => Math.round(value * 1000) / 1000;

/** Held counts are known when the asset carries them; an older asset without them draws published only. */
export function oakEvidenceTotals(rows: readonly OakEvidenceRow[]): OakEvidenceTotals {
  const published = rows.reduce((sum, row) => sum + row.published.length, 0);
  const counted = rows.some(row => typeof row.held === 'number');
  const held = counted ? rows.reduce((sum, row) => sum + (row.held ?? 0), 0) : 0;
  return { published, held, total: published + held, counted };
}

function sector(start: number, end: number) {
  const point = (radius: number, turn: number) => {
    const angle = turn * 2 * Math.PI - Math.PI / 2;
    return `${round(21 + radius * Math.cos(angle))} ${round(21 + radius * Math.sin(angle))}`;
  };
  const large = end - start > 0.5 ? 1 : 0;
  return `M${point(20, start)} A20 20 0 ${large} 1 ${point(20, end)} L${point(14, end)} A14 14 0 ${large} 0 ${point(14, start)} Z`;
}

/** Ring segments on a 42 by 42 view box, clockwise from the top; a part that fills the ring is two halves, since one arc cannot close a circle. */
export function oakEvidenceRing(totals: OakEvidenceTotals): { status: OakEvidenceStatus; d: string }[] {
  if (!totals.total) return [];
  const parts: { status: OakEvidenceStatus; d: string }[] = [];
  let at = 0;
  for (const [status, value] of [['published', totals.published], ['held', totals.held]] as const) {
    if (!value) continue;
    const share = value / totals.total;
    if (share >= 1) parts.push({ status, d: sector(0, 0.5) }, { status, d: sector(0.5, 1) });
    else parts.push({ status, d: sector(at, at + share) });
    at += share;
  }
  return parts;
}

export type OakEvidenceNode = Readonly<{ y: number; height: number }>;
export type OakEvidenceTarget = OakEvidenceNode & Readonly<{ status: OakEvidenceStatus }>;
export type OakEvidenceLink = Readonly<{ row: number; status: OakEvidenceStatus; from: number; to: number; width: number; lead: boolean; d: string }>;

/**
 * Sankey on a view box 100 wide and `height` tall: record nodes on the left, status nodes on the right. Every ribbon starts at
 * x 0 and ends at x 100, inside its two node bars (Oak's R6-C16: links meet their nodes), and the first record's path leads.
 */
export function oakEvidenceSankey(rows: readonly OakEvidenceRow[]) {
  const totals = oakEvidenceTotals(rows);
  const stack = rows.length * OAK_EVIDENCE_ROW + Math.max(0, rows.length - 1) * OAK_EVIDENCE_GAP;
  const height = Math.max(stack, 2 * OAK_EVIDENCE_ROW + OAK_EVIDENCE_GAP);
  const nodes: OakEvidenceNode[] = rows.map((_, index) => ({ y: index * (OAK_EVIDENCE_ROW + OAK_EVIDENCE_GAP), height: OAK_EVIDENCE_ROW }));
  const half = (height - OAK_EVIDENCE_GAP) / 2;
  const targets: OakEvidenceTarget[] = totals.counted
    ? [{ status: 'published', y: 0, height: half }, { status: 'held', y: half + OAK_EVIDENCE_GAP, height: half }]
    : [{ status: 'published', y: 0, height }];
  const values = (row: OakEvidenceRow) => ({ published: row.published.length, held: totals.counted ? row.held ?? 0 : 0 });
  const limits = [...rows.map(row => { const { published, held } = values(row); return published + held ? OAK_EVIDENCE_ROW / (published + held) : Infinity; }),
    ...targets.map(target => totals[target.status] ? target.height / totals[target.status] : Infinity)];
  const unit = Math.min(...limits);
  const links: OakEvidenceLink[] = [];
  if (!Number.isFinite(unit)) return { height, nodes, targets, links, totals };
  const into = new Map(targets.map(target => [target.status, target.y + (target.height - totals[target.status] * unit) / 2]));
  rows.forEach((row, index) => {
    const value = values(row);
    let from = nodes[index]!.y + (OAK_EVIDENCE_ROW - (value.published + value.held) * unit) / 2;
    for (const status of ['published', 'held'] as const) {
      const width = value[status] * unit;
      if (!width) continue;
      const to = into.get(status)!;
      into.set(status, to + width);
      const [a, b, w] = [round(from), round(to), round(width)];
      links.push({ row: index, status, from: a, to: b, width: w, lead: index === 0,
        d: `M0 ${a} C50 ${a},50 ${b},100 ${b} L100 ${round(b + w)} C50 ${round(b + w)},50 ${round(a + w)},0 ${round(a + w)} Z` });
      from += width;
    }
  });
  return { height, nodes, targets, links, totals };
}
