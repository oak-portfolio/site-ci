import type * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { Icon } from "@/components/ui/Icon";
import { oakMetricKindOn } from "@/lib/oakFlags/metricKind";
import { oakMetricResultOn } from "@/lib/oakFlags/metricResult";
import { oakRecordFactsState, useOakRecordFacts, type OakMetricKind, type OakWorkFacts } from "@/lib/oakRecordFacts";
import { oakOpenUIOwnWords, oakOpenUIRepeats } from "../../../../packages/oak-agent-contracts/src/openui/verdict";
import { Claim, claimId, label, oakVerbatim, useScope } from "../scope";

const TINT = /^#[0-9a-f]{3,8}$/i;

/** R19 visual review: a trailing "+", "%" or "x" reads as a quieter mark beside the number, as keynote numerals set it. */
function MetricNumber({ value }: { value: string }) {
  const match = value.match(/^(.*\d[\d.,]*\s?[KkMmBb]?)([+%x\u00d7])$/);
  return match ? <span>{match[1]}<span className="oak-openui__metric-suffix">{match[2]}</span></span> : <span>{value}</span>;
}

export const OAK_METRIC_KINDS: Readonly<Record<OakMetricKind, Readonly<{ word: string; rank: number }>>> = {
  result: { word: "Result", rank: 0 }, scope: { word: "Scope", rank: 1 }, context: { word: "Context", rank: 2 },
};

export type OakMetricKindOf = Readonly<{ kind: OakMetricKind; period?: string }>;

type Claims = ReturnType<typeof useScope>["claims"];

/** The work records every citation of these claims points to, each once. */
function recordsOf(claims: Claims, knowledgeRevision: string, ids: readonly string[]): OakWorkFacts[] {
  const records = new Map<string, OakWorkFacts>();
  for (const id of ids) for (const { documentId } of claims.get(id)?.citations ?? []) {
    const state = oakRecordFactsState(documentId, knowledgeRevision);
    if (state.status === "loaded" && state.facts.kind === "work") records.set(documentId, state.facts);
  }
  return [...records.values()];
}

/** The reviewed kind of the record metric this number copies: its whole value, else its number before the unit ("8K+" of "8K+ images"); matches that disagree decide nothing. */
function kindOf(records: readonly OakWorkFacts[], value: string): OakMetricKindOf | undefined {
  const wanted = value.trim();
  const all = records.flatMap(record => (record.metrics ?? []).map(metric => ({ metric, period: record.period })));
  const exact = all.filter(({ metric }) => metric.value === wanted);
  const matches = exact.length ? exact : all.filter(({ metric }) => metric.value.split(" ")[0] === wanted);
  const kinds = new Set(matches.map(({ metric }) => metric.kind));
  const periods = new Set(matches.map(({ period }) => period));
  const [kind] = kinds;
  if (kinds.size !== 1 || !kind) return undefined;
  const [period] = periods;
  return periods.size === 1 && period ? { kind, period } : { kind };
}

/** Ticket 43: each item's kind while oakMetricKind is on, from the record facts of the answer's revision, and whether
 * the cited records carry kinds with no result among them; off, none. */
export function useOakMetricKinds(items: readonly Readonly<{ claim: string; value: string }>[]): Readonly<{ kinds: (OakMetricKindOf | undefined)[]; noResult: boolean }> {
  const { claims, knowledgeRevision = "" } = useScope();
  const on = oakMetricKindOn();
  useOakRecordFacts("", on ? knowledgeRevision : "");
  if (!on) return { kinds: items.map(() => undefined), noResult: false };
  const records = recordsOf(claims, knowledgeRevision, items.map(item => item.claim));
  const metrics = records.flatMap(record => record.metrics ?? []);
  return {
    kinds: items.map(item => kindOf(recordsOf(claims, knowledgeRevision, [item.claim]), item.value)),
    noResult: metrics.some(metric => metric.kind) && !metrics.some(metric => metric.kind === "result"),
  };
}

/** The record's cover tint when its reviewed kind for this value is `result`, else null. */
function useResultTint(documentId: string, value: string) {
  const on = oakMetricResultOn();
  const { knowledgeRevision = "" } = useScope();
  const state = useOakRecordFacts(documentId, on && documentId ? knowledgeRevision : "");
  if (!on || state.status !== "loaded" || state.facts.kind !== "work") return null;
  return kindOf([state.facts], value)?.kind === "result" && TINT.test(state.facts.coverTint) ? state.facts.coverTint : null;
}

function MetricView({ label: name, value, claim: id }: { label: string; value: string; claim: string }) {
  const { claims } = useScope();
  const claim = claims.get(id);
  const { kinds: [found] } = useOakMetricKinds([{ claim: id, value }]);
  const kind = found?.kind;
  const tint = useResultTint(claim?.citations.find(item => item.documentId.startsWith("work:"))?.documentId ?? "", value);
  if (!oakVerbatim(claim, value)) return <p className="oak-openui__prose"><Claim id={id} /></p>;
  const said = oakOpenUIOwnWords(name, 40) ?? "";
  const words = oakOpenUIRepeats(claim?.text ?? "", said) ? "" : said;
  const chip = kind ? <span className="oak-openui__metric-kind">{OAK_METRIC_KINDS[kind].word}</span> : null;
  if (kind && kind !== "result") return <div className="oak-openui__metric" data-kind={kind}>
    {chip}
    <p className="oak-openui__metric-row" aria-hidden="true"><span className="oak-openui__metric-row-value">{value.trim()}</span><span className="oak-openui__metric-label">{words}</span></p>
    <p className="oak-openui__metric-claim"><Claim id={id} /></p>
  </div>;
  return <div className="oak-openui__metric" data-kind={kind} data-result={tint ? "" : undefined} style={tint ? { "--oak-metric-tint": tint } as React.CSSProperties : undefined}>
    {tint ? null : <span className="oak-openui__glyph" aria-hidden="true"><Icon name="lifeTracking" size={16} /></span>}
    {found?.period ? <p className="oak-openui__metric-meta">{chip}<span className="oak-openui__metric-period">{found.period}</span></p> : chip}
    <p className="oak-openui__metric-value" aria-hidden="true"><MetricNumber value={value.trim()} /><span className="oak-openui__metric-label">{words}</span></p>
    <p className="oak-openui__metric-claim"><Claim id={id} /></p>
  </div>;
}

export const Metric = defineComponent({
  name: "Metric",
  description: "One number a claim states, copied exactly as the claim writes it (\"40%\", \"3 weeks\"), with a 1 to 4 word label.",
  props: z.object({ label: label(40), value: label(24), claim: claimId }),
  component: ({ props }) => <MetricView label={props.label} value={props.value} claim={props.claim} />,
});
