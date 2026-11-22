/** Ticket 31: one ProjectWall tile's facts, all from the cited record (never the program). `order` is its cited position. */
export type OakWallTile = Readonly<{ id: string; order: number; category?: string; stack: readonly string[]; date?: string; full: boolean }>;
export type OakWallSort = 'cited' | 'recent';

const facets = (tile: OakWallTile) => [...(tile.category ?? '').split(/,\s*/), ...tile.stack].map(item => item.trim()).filter(Boolean);
const CHIPS = 6;

/** Filter chips: category terms and stack items shared by 2 or more tiles, at most 6. A chip every tile matches filters nothing, so it is not drawn. */
export function oakProjectWallChips(tiles: readonly OakWallTile[]) {
  const all = [...new Set(tiles.flatMap(facets))];
  const share = (chip: string) => tiles.filter(tile => facets(tile).includes(chip)).length;
  return all.filter(chip => share(chip) >= 2 && share(chip) < tiles.length).slice(0, CHIPS);
}

const newest = (a: OakWallTile, b: OakWallTile) => (b.date ?? '').localeCompare(a.date ?? '') || a.order - b.order;

/** The tiles every chosen chip matches (AND), as cited or newest first. */
export function oakProjectWallView(tiles: readonly OakWallTile[], { chips, sort }: Readonly<{ chips: readonly string[]; sort: OakWallSort }>) {
  const shown = tiles.filter(tile => chips.every(chip => facets(tile).includes(chip)));
  return sort === 'recent' ? [...shown].sort(newest) : [...shown].sort((a, b) => a.order - b.order);
}

/** A Recent sort is drawn only when it would change the order. */
export const oakProjectWallSorts = (tiles: readonly OakWallTile[]) =>
  tiles.length > 1 && [...tiles].sort(newest).some((tile, index) => tile.id !== tiles[index]!.id);

/** The reading path: full case studies first, then cited order. */
export const oakProjectWallPath = (tiles: readonly OakWallTile[]) => [...tiles].sort((a, b) => Number(b.full) - Number(a.full) || a.order - b.order);
