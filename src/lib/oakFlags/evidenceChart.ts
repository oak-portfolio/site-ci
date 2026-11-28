/** Ticket 40: EvidenceChart charts published artifacts per cited record; off, it is the plain Points list. */
export const oakEvidenceChart = false;
export const oakGalleryKey = "evidenceChart";

let forced: boolean | null = null;

export function forceOakEvidenceChart(on: boolean | null) {
  forced = on;
}

export const oakEvidenceChartOn = () => forced ?? oakEvidenceChart;
