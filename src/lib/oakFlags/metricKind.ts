/** Ticket 43a: a metric's kind gives Metric and Stats a Result, Context or Scope chip, and only a result is the display tile; off, every metric reads as today. */
export const oakMetricKind = false;
export const oakGalleryKey = "metricKind";

let forced: boolean | null = null;

export function forceOakMetricKind(on: boolean | null) {
  forced = on;
}

export const oakMetricKindOn = () => forced ?? oakMetricKind;
