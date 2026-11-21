/** Ticket 57 (R14-C1): a Metric whose record marks it a `result` (ticket 43's kind) shows a display numeral in its cover's glow. */
export const oakMetricResult = false;
export const oakGalleryKey = "metricResult";

let forced: boolean | null = null;

export function forceOakMetricResult(on: boolean | null) {
  forced = on;
}

export const oakMetricResultOn = () => forced ?? oakMetricResult;
