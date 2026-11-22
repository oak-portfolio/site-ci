/** Display-side string helpers for role-fit titles, quoted evidence and composer quote chips. The Worker and contracts are untouched. */

const ellipsis = "\u2026";

/** Quote chips a visitor can stage from Oak's answers at once, and the longest one kept. */
export const OAK_QUOTE_MAX = 3;
export const OAK_QUOTE_CHARACTERS = 280;
const quoteLine = (quote: string) => `About \u201c${quote}\u201d`;
const foldOverhead = (count: number, typed: string) => count * quoteLine("").length + Math.max(0, count - 1) + (count && typed ? 2 : 0);
/** The quote, cut to `room` characters with an ellipsis when longer. */
export const shortenOakQuote = (quote: string, room: number) => quote.length > room ? `${quote.slice(0, room - 1).trimEnd()}${ellipsis}` : quote;

/** Characters a new quote could take beside these quotes and this typing, within the question limit. */
export function oakQuoteRoom(quotes: readonly string[], typed: string, limit: number) {
  const used = quotes.reduce((sum, quote) => sum + quote.length, 0);
  return Math.min(OAK_QUOTE_CHARACTERS, limit - typed.length - used - foldOverhead(quotes.length + 1, typed));
}

/**
 * One question from staged quotes and the visitor's words: each quote on its own line, then what they typed. The typing is
 * never cut; the quotes share what room is left, shortening evenly, and the last ones drop when even 8 characters won't fit.
 */
export function foldOakQuotes(quotes: readonly string[], typed: string, limit: number): { text: string; quotes: string[] } {
  for (let kept = quotes.length; kept > 0; kept--) {
    const each = Math.floor((limit - typed.length - foldOverhead(kept, typed)) / kept);
    if (each < 8) continue;
    const fitted = quotes.slice(0, kept).map(quote => shortenOakQuote(quote, each));
    return { text: `${fitted.map(quoteLine).join("\n")}${typed ? `\n\n${typed}` : ""}`, quotes: fitted };
  }
  return { text: typed, quotes: [] };
}
const authorship = /^[^:\u201c\u201d"\n]{1,80}\swrote:\s*/;
const terminal = /[.!?;:)\]]$/;
/** "<Author> wrote ...: “quote”", including the advice form with a dated parenthetical before the colon. */
const attributed = /^([^\u201c\u201d"\n]{1,400}?\bwrote\b[^\u201c\u201d"\n]{0,300}?):\s*[\u201c"]([\s\S]*)[\u201d"]\s*$/;
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const readableDate = (value: string) => {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${months[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}` : value.trim();
};

/**
 * Splits an attributed evidence line into the quote itself and a quiet "when" caption, so the quote reads on its own and
 * nobody is named in the third person. Lines without an attribution come back unchanged with no caption.
 */
export function quoteParts(text: string): { quote: string; context: string | null; attributed: boolean } {
  const match = text.trim().match(attributed);
  if (!match) return { quote: text, context: null, attributed: false };
  const lead = match[1];
  const dating = lead.split(/\bwrote\b/).pop() ?? "";
  const period = (dating.match(/work period:\s*([^;)]+)/) ?? dating.match(/\bduring\s+([^;():]+)/))?.[1]?.trim();
  const published = lead.match(/published:\s*([^;)]+)/)?.[1]?.trim();
  const parts = [period && period !== "not specified" ? `Work from ${period}` : null,
    published && published !== "not specified" ? `published ${readableDate(published)}` : null].filter(Boolean);
  const context = parts.length ? parts.join(", ").replace(/^published/, "Published") : null;
  return { quote: readableRow(match[2].trim()), context, attributed: true };
}

/** A quoted Markdown table row ("Flat UI | Improved | Figma Make…") reads as cells joined by a middle dot. */
const readableRow = (value: string) => (value.match(/\s\|\s/g)?.length ?? 0) >= 2
  ? value.replace(/^\|\s*|\s*\|$/g, "").split(/\s+\|\s+/).map(cell => cell.trim()).filter(Boolean).join(" \u00b7 ") : value;

/**
 * The quote inside the exact `<Authors> wrote: “…”` form the Worker's quote resolvers build, or null for any other claim,
 * so a claim the model wrote in its own words is never cut down to its quoted tail (D148).
 */
export function resolverQuote(text: string): string | null {
  // The advice resolver adds a dated note: "<Authors> wrote (work period: …; published: …): “…”".
  const match = text.match(/^([^:.!?()\u201c\u201d"\n]{1,160}) wrote(?: \(work period: [^()\n]{1,200}\))?: \u201c([\s\S]+)\u201d$/);
  return match && !/\bwrote\b/.test(match[1]!) ? readableRow(match[2]!.trim()) : null;
}

/** Drops the "<Author> wrote:" lead-in and the wrapping quote marks so the quote stands on its own. */
export function plainQuote(text: string): string {
  return readableRow(unwrappedQuote(text));
}
function unwrappedQuote(text: string): string {
  const parts = quoteParts(text);
  if (parts.attributed) return parts.quote;
  let value = text.trim().replace(authorship, "");
  const pairs: ReadonlyArray<readonly [string, string]> = [["\u201c", "\u201d"], ["\"", "\""]];
  for (const [open, close] of pairs) {
    if (value.length > 1 && value.startsWith(open) && value.endsWith(close)) { value = value.slice(1, -1).trim(); break; }
  }
  return value;
}

const isWordChar = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);

type Clause = { from: number; to: number; text: string };
const bulletLead = /^\s*(?:[-*\u2022\u2013\u2014]|\d+[.)])\s+/;
/** A text's lines, each split at sentence ends, as offsets into the text, bullet markers dropped. */
function clauses(source: string): Clause[] {
  const units: Clause[] = [];
  const push = (from: number, to: number) => {
    const text = source.slice(from, to).replace(bulletLead, "").replace(/\s+/g, " ").trim();
    if (/[\p{L}\p{N}]/u.test(text)) units.push({ from, to, text });
  };
  const line = /[^\n\r]+/g;
  for (let match = line.exec(source); match; match = line.exec(source)) {
    const end = match.index + match[0].length;
    let from = match.index, depth = 0;
    for (let at = match.index; at < end; at++) {
      const char = source[at]!;
      if (char === "(" || char === "[") depth += 1;
      else if ((char === ")" || char === "]") && depth > 0) depth -= 1;
      else if (/[.!?]/.test(char) && depth === 0 && (at + 1 === end || /\s/.test(source[at + 1]!)) && !(char === "." && abbreviated(source.slice(from, at)))) {
        while (at + 1 < end && /[.!?]/.test(source[at + 1]!)) at += 1;
        push(from, at + 1);
        from = at + 1;
      }
    }
    push(from, end);
  }
  return units;
}
/** Words a full stop belongs to rather than ends a sentence: "e.g.", "i.e.", "etc.", "vs." and a few titles. */
const abbreviation = /(?:^|[\s(\[])(?:e\.g|i\.e|etc|vs|cf|incl|approx|esp|Inc|Ltd|Corp|Jr|Sr|Dr|Mr|Mrs|Ms)$/i;
const abbreviated = (before: string) => abbreviation.test(before);
/** Drops a dangling bullet dash or trailing punctuation at a clause's end, and a separator a span started on (R22 live:
 * ": React"). A leading dot stays (".NET"). */
const tidy = (text: string) => text.replace(/\s+-\s*$/, "").replace(/[\s,;:]+$/, "").replace(/^(?:[\s,;:]+|-\s+)+/, "");

/**
 * Q16-D7: the requirement a role-fit row is about, as a whole line or sentence of the visitor's role description. A model's
 * span can start in one bullet and run into the next ("...accessibility - Work with..."), so the heading is the clause the
 * span covers most, never a fragment across bullets or section labels. Without the role description the span's own text
 * is split the same way (" - " bullet joins included) and its longest clause is kept.
 */
export function requirementClause(text: string, start: number, end: number, roleDescription?: string): string {
  if (roleDescription && start >= 0 && end > start && end <= roleDescription.length) {
    let best: Clause | null = null, bestOverlap = 0;
    for (const unit of clauses(roleDescription)) {
      const overlap = Math.min(unit.to, end) - Math.max(unit.from, start);
      if (overlap > bestOverlap) { best = unit; bestOverlap = overlap; }
    }
    if (best) return tidy(best.text);
  }
  const pieces = clauses(text.replace(/\s+[-\u2022\u2013\u2014]\s+(?=\p{Lu})/gu, "\n"));
  const longest = pieces.reduce<Clause | null>((top, piece) => !top || piece.text.length > top.text.length ? piece : top, null);
  return longest ? tidy(longest.text) : text.trim().replace(/[\s,;:]+$/, "");
}

/**
 * Requirement title that starts and ends on whole words, with an ellipsis on each trimmed or mid-line edge.
 * With the original role description the offsets snap outward to word boundaries. Without it, the Worker-validated text
 * is kept word for word: a short leading word ("no", "not", "with") can carry the meaning, so nothing is guessed away.
 */
export function wholeWordTitle(text: string, start: number, end: number, roleDescription?: string): string {
  if (roleDescription && start >= 0 && end > start && end <= roleDescription.length) {
    let from = start, to = end;
    while (from > 0 && isWordChar(roleDescription[from - 1]) && isWordChar(roleDescription[from])) from -= 1;
    while (to < roleDescription.length && isWordChar(roleDescription[to - 1]) && isWordChar(roleDescription[to])) to += 1;
    const title = roleDescription.slice(from, to).trim();
    if (title) {
      const before = roleDescription.slice(0, from).trimEnd();
      const after = roleDescription.slice(to).trimStart();
      const midLineBefore = before.length > 0 && !/[\n\r]$/.test(roleDescription.slice(0, from).replace(/[ \t]+$/, ""));
      const midLineAfter = after.length > 0 && !/^[\n\r]/.test(roleDescription.slice(to).replace(/^[ \t]+/, ""));
      return `${midLineBefore ? ellipsis : ""}${title.replace(/[\s,;:]+$/, "")}${midLineAfter && !terminal.test(title) ? ellipsis : ""}`;
    }
  }
  // shortcut: without the source, a span whose offsets drifted mid-word shows its fragment ("ou will…"); keeping the role
  // description for reopened turns would let these snap like the branch above.
  return text.trim().replace(/[\s,;:]+$/, "");
}
