/** Ticket 34: Board's columns, grouped by a reviewed field only (O11: no team column until a reviewed field carries it). */
export type OakBoardKind = 'stand' | 'sboard';
/** One claim, the record it cites first, that record's reviewed column value and its date (ISO), when known. */
export type OakBoardRow = Readonly<{ claim: string; document: string; column: string; date?: string }>;
export type OakBoardCard = Readonly<{ document: string; claims: readonly string[] }>;
export type OakBoardColumn = Readonly<{ key: string; label: string; items: readonly OakBoardCard[] }>;

/** Fixed column order and labels per kind; a value outside these is not a reviewed column and its rows are left out. */
export const OAK_BOARD_COLUMNS: Readonly<Record<OakBoardKind, readonly (readonly [string, string])[]>> = {
  stand: [['full', 'Full case study'], ['in-progress-stub', 'In progress']],
  sboard: [['full-time', 'Full-time'], ['contract', 'Contract'], ['part-time', 'Part-time'], ['self-employed', 'Self-employed']],
};

/** Ordered non-empty columns, one card per record (its claims in order), and the newest record by date (null when none is dated). */
export function oakBoardView(kind: OakBoardKind, rows: readonly OakBoardRow[]): { columns: OakBoardColumn[]; newest: string | null } {
  const columns = OAK_BOARD_COLUMNS[kind].map(([key, label]) => {
    const items: { document: string; claims: string[] }[] = [];
    for (const row of rows.filter(row => row.column === key)) {
      const card = items.find(item => item.document === row.document);
      if (card) card.claims.push(row.claim);
      else items.push({ document: row.document, claims: [row.claim] });
    }
    return { key, label, items };
  }).filter(column => column.items.length > 0);
  const placed = new Set(columns.flatMap(column => column.items.map(item => item.document)));
  const dated = rows.filter(row => placed.has(row.document) && row.date && !Number.isNaN(Date.parse(row.date)));
  const newest = dated.length ? dated.reduce((a, b) => Date.parse(b.date!) > Date.parse(a.date!) ? b : a).document : null;
  return { columns, newest };
}
