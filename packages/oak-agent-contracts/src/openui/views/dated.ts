import { oakOpenUIOwnWords, oakOpenUIRepeats, oakOpenUIStated } from '../verdict.ts';

/** Ticket 227: a Metric draws its number only when the claim states it, and its label only in own words the claim does not repeat. */
export function oakMetricView(claimText: string | undefined, label: string, value: string) {
  const said = oakOpenUIOwnWords(label, 40) ?? '';
  return { stated: claimText !== undefined && oakOpenUIStated(claimText, value), value: value.trim(), label: said && !oakOpenUIRepeats(claimText ?? '', said) ? said : '' };
}
