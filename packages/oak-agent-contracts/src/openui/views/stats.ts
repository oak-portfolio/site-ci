import { oakOpenUIStated } from '../verdict.ts';
import { claimOf, prop, type OakClaimFacts, type OakOpenUINode } from './node.ts';

/** R27n live (live-v41 numbers): a Metric's big number stands about two sentence lines taller than a Meter's bar, so a Metric
 * beside a Meter with a 40-character longer sentence left the Meter's tile about 120px empty. Each Metric counts its number
 * as this many sentence characters before the tiles are compared. */
const METRIC_HEAD_CHARS = 100;

/** Tiles stack one per row when their heights would differ a lot: a value over 9 characters (R27l: "roughly $600K" wrapped
 * at display size), or sentences differing by 1.6 times and 80 characters (R27g). The Metric head counts only where it
 * changes a tile's height against its neighbors: when a drawn big number sits among tiles without one (R27n). Two Metrics
 * carry the same head, and adding it to both weakened the ratio, so 70 against 160 characters stopped stacking (R27o review). */
function uneven(tiles: readonly OakOpenUINode[], facts: OakClaimFacts) {
  if (tiles.some(tile => String(prop(tile, 'value') ?? '').trim().length > 9)) return true;
  // A Metric whose value the claim does not state renders as prose (MetricView), so it has no big number.
  const headed = tiles.map(tile => { const text = facts(claimOf(tile))?.text;
    return tile?.typeName === 'Metric' && text !== undefined && oakOpenUIStated(text, String(prop(tile, 'value') ?? '')); });
  const mixed = headed.some(Boolean) && !headed.every(Boolean);
  const known = tiles.map((tile, index) => { const length = facts(claimOf(tile))?.text.length ?? 0;
    return length > 0 && mixed && headed[index] ? length + METRIC_HEAD_CHARS : length; }).filter(length => length > 0);
  if (known.length < 2) return false;
  const most = Math.max(...known), least = Math.min(...known);
  return most >= least * 1.6 && most - least >= 80;
}

/** Stats: the first 4 items are tiles and the rest render below; null for 0 or 1 item (render it plain). `onePage` when
 * every tile cites the same page, so the tiles drop their chips (R19: the answer already shows it). */
export function oakOpenUIStatsView(items: readonly OakOpenUINode[], facts: OakClaimFacts) {
  if (items.length <= 1) return null;
  const tiles = items.slice(0, 4);
  const pages = new Set(tiles.map(tile => facts(claimOf(tile))?.document ?? ''));
  return { tiles, rest: items.slice(4), onePage: pages.size === 1 && !pages.has(''), uneven: uneven(tiles, facts) };
}
