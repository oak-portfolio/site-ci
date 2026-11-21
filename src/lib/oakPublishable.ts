import type { EvidenceStatus } from "@/data/caseStudies";

/** A metric or artifact reaches a public surface only when Oak verified it; `needs-oak` and `do-not-publish` stay private. */
export function oakPublishable(item: Readonly<{ status: EvidenceStatus }>): boolean {
  return item.status === "verified";
}

/** A publishable metric that describes the work: not the page's own cover file, the role the meta line already shows, or a "TBD". */
export function oakResultMetric(metric: Readonly<{ status: EvidenceStatus; label: string; value: string }>): boolean {
  return oakPublishable(metric) && !/^(cover|role)\b/i.test(metric.label) && !/^tbd$/i.test(metric.value.trim());
}
