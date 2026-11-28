import { oakOpenUIOwnWords, oakOpenUIRepeats, oakOpenUIStated } from '../verdict.ts';

/** Ticket 298: at most two words before the figure ("More than 8,000 ...") means the sentence opens with it. */
const OPENING_WORDS_BEFORE = 2;

function oakOpensWith(claimText: string, value: string) {
  const head = claimText.trim().split(/\s+/).slice(0, OPENING_WORDS_BEFORE + value.trim().split(/\s+/).length).join(' ');
  return oakOpenUIStated(head, value);
}

function oakSingular(word: string) {
  if (/ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  return /[^s]s$/.test(word) ? word.slice(0, -1) : word;
}

const oakAcronym = (word: string) => /^[^a-z]*[A-Z]{2,}[^a-z]*$/.test(word);
const oakWordKey = (word: string) => (oakAcronym(word) ? word : oakSingular(word.toLowerCase()));

function oakWords(text: string) {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).flatMap(word => (oakAcronym(word) ? [word, oakWordKey(word.toLowerCase())] : [oakWordKey(word)]));
}

/** Ticket 309: every word of the label sits in the sentence, case and singular or plural aside, in any order; an acronym keeps its case (ticket 213). */
export function oakHoldsLabel(claimText: string, label: string) {
  const words = (label.match(/[\p{L}\p{N}]+/gu) ?? []).map(oakWordKey);
  const said = new Set(oakWords(claimText));
  return words.length > 0 && words.every(word => said.has(word));
}

/** Ticket 227: a Metric draws its number only when the claim states it, and its label only in own words the claim does not repeat.
 * Ticket 298: a claim that opens with the number is the sentence alone, so the number reads once.
 * Ticket 309: so is a claim that states the number and holds every word of the label, unless the tile adds something:
 * it sits in a Stats group (ruling 99) or carries a kind or period (ruling 100).
 * Ticket 325: a Stats tile with no kind or period keeps that number and drops a label its sentence holds. */
export function oakMetricView(claimText: string | undefined, label: string, value: string, inStats = false, kinded = false) {
  const said = oakOpenUIOwnWords(label, 40) ?? '';
  const stated = claimText !== undefined && oakOpenUIStated(claimText, value) && !oakOpensWith(claimText, value) && (inStats || kinded || !oakHoldsLabel(claimText, label));
  const held = inStats && !kinded && oakHoldsLabel(claimText ?? '', label);
  return { stated, value: value.trim(), label: said && !held && !oakOpenUIRepeats(claimText ?? '', said) ? said : '' };
}
