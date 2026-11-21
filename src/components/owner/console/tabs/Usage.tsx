import type { CSSProperties } from 'react';
import { MeterBar } from '@/components/ui/meter';
import { dataOf, type ReadData } from '../reads.ts';
import { defineTab, cardRead, type CardRead } from '../tab.ts';
import { day, share, usd } from '../format.ts';

type Daily = ReadData<'usageDaily'>;
type PerDay = ReturnType<typeof perDayModel>;

const niceCeiling = (micro: number) => {
  const unit = 10 ** Math.floor(Math.log10(Math.max(micro, 1)));
  return [1, 2, 5, 10].map(step => step * unit).find(value => value >= micro) ?? unit * 10;
};
const axisLabel = (micro: number) => `$${+(micro / 1e6).toFixed(2)}`;
const percent = (part: number, whole: number) => part <= 0 ? 0 : +Math.min(100, Math.max(1, part * 100 / whole)).toFixed(2);
const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export function perDayModel(daily: Daily) {
  const { paceMicroUsd } = daily.pace;
  const peak = daily.days.reduce((best, row) => row.actualMicroUsd + row.heldMicroUsd > best.total ? { total: row.actualMicroUsd + row.heldMicroUsd, day: row.day } : best, { total: 0, day: '' });
  const top = Math.max(peak.total, paceMicroUsd ?? 0);
  const axisMax = niceCeiling(top);
  const days = daily.days.map(row => {
    const n = Number(row.day.slice(8)), label = day(dayMs(row.day));
    return { day: row.day, n, label, tick: n % 2 === 1, major: n === 1 || n % 5 === 0,
      actual: percent(row.actualMicroUsd, axisMax), held: percent(row.heldMicroUsd, axisMax),
      name: `${label}, ${usd(row.actualMicroUsd)} actual${row.heldMicroUsd > 0 ? `, ${usd(row.heldMicroUsd)} held` : ''}` };
  });
  const spent = daily.days.reduce((sum, row) => sum + row.actualMicroUsd, 0);
  const pace = paceMicroUsd === null ? null : usd(paceMicroUsd);
  const summary = daily.days.length === 0 ? 'No days read yet.'
    : `${daily.days.length} ${daily.days.length === 1 ? 'day' : 'days'} read, ${usd(spent)} actual.${peak.total > 0 ? ` Highest day ${day(dayMs(peak.day))} at ${usd(peak.total)}.` : ' No spend yet.'} ${pace ? `Daily pace ${pace}.` : 'No daily pace set.'}`;
  return { days, summary, pace, pacePct: paceMicroUsd === null ? null : percent(paceMicroUsd, axisMax),
    axis: (top === 0 ? [0] : [axisMax, axisMax / 2, 0]).map(axisLabel),
    saver: { state: { on: 'On', off: 'Off', unknown: 'Unknown' }[daily.saver.state], threshold: daily.saver.thresholdPercent === null ? 'No threshold set.' : `Turns on at ${daily.saver.thresholdPercent}%.` },
    backlog: daily.rereadBacklog === null ? 'Unknown' : String(daily.rereadBacklog) };
}

export function usageModel(usage: ReadData<'usage'> | null, perDay: CardRead<PerDay>) {
  const t = usage?.totals, ceiling = usage?.effectiveLimitMicroUsd ?? null;
  return {
    actual: usd(t?.actualMicroUsd ?? null), held: usd(t?.heldMicroUsd ?? null), available: usd(t?.availableMicroUsd ?? null), ceiling: usd(ceiling),
    shares: t && ceiling ? { actual: share(t.actualMicroUsd, ceiling), held: share(t.heldMicroUsd, ceiling), available: share(t.availableMicroUsd, ceiling) } : null,
    billable: usage?.enabled ?? null, resets: usage ? day(usage.reset.nextAt) : null, perDay,
  };
}
type Model = ReturnType<typeof usageModel>;

const tiles = [['actual', 'Actual'], ['held', 'Held'], ['available', 'Available'], ['ceiling', 'Ceiling']] as const;

type Css = CSSProperties & Record<`--${string}`, number>;

function SpendPerDay({ data }: { data: PerDay }) {
  return <>
    <div className="oc-chart" role="group" aria-labelledby="oc-per-day" aria-describedby="oc-per-day-text">
      <ul className="oc-chart__axis" aria-hidden="true">{data.axis.map((label, i) => <li key={i}>{label}</li>)}</ul>
      <ol className="oc-bars">
        {data.pacePct !== null && <li className="oc-bars__pace" aria-hidden="true" style={{ '--oc-at': data.pacePct } as Css} />}
        {data.days.map(row => <li key={row.day} data-tick={row.tick || undefined} data-major={row.major || undefined}>
          <span className="oc-bar" role="img" aria-label={row.name} style={{ '--oc-actual': row.actual, '--oc-held': row.held } as Css} />
          <span className="oc-bars__day" aria-hidden="true">{row.n}</span>
        </li>)}
      </ol>
    </div>
    <ul className="oc-legend" aria-hidden="true">
      <li><span className="oc-swatch" data-part="actual" />Actual</li>
      <li><span className="oc-swatch" data-part="held" />Held</li>
      {data.pace && <li><span className="oc-swatch" data-part="pace" />Daily pace {data.pace}</li>}
    </ul>
    <p className="oc-muted" id="oc-per-day-text">{data.summary}</p>
  </>;
}

function SaverMode({ data }: { data: PerDay }) {
  return <section className="oc-card oc-saver" aria-labelledby="oc-saver">
    <header className="oc-card__head"><h2 id="oc-saver">Saver mode</h2>
      <span className="oc-chip" data-tone={data.saver.state === 'On' ? 'watch' : undefined}>{data.saver.state}</span></header>
    <p className="oc-muted">{data.saver.threshold}</p>
    <p className="oc-muted">Lost-copy reread backlog: <strong>{data.backlog}</strong></p>
  </section>;
}

function UsageView({ model }: { model: Model }) {
  return <div className="oc-stack">
    <dl className="oc-grid oc-grid--4">{tiles.map(([key, label]) => <div key={key} className="oc-tile" data-part={key}>
      <dt><span className="oc-swatch" data-part={key} aria-hidden="true" />{label}</dt><dd>{model[key]}</dd>
    </div>)}</dl>
    <section className="oc-card" aria-labelledby="oc-ledger">
      <header className="oc-card__head"><h2 id="oc-ledger">Sponsor ledger this month</h2>
        <span className="oc-muted">{model.resets ? `Resets ${model.resets}. Held costs carry over.` : ''}{model.billable === false ? ' Billable answers are off.' : ''}</span></header>
      {model.shares ? <span className="oc-ledger" role="img" aria-label={`Actual ${model.actual}, held ${model.held}, available ${model.available}, against a ceiling of ${model.ceiling}`}>
        {/* Cumulative layers, widest at the back, so each part shows as its own segment. */}
        {([['available', model.shares.actual + model.shares.held + model.shares.available], ['held', model.shares.actual + model.shares.held], ['actual', model.shares.actual]] as const)
          .map(([part, value]) => <span key={part} className="oc-ledger__layer" data-part={part}><MeterBar value={Math.min(100, value)} aria-hidden="true" /></span>)}
      </span> : <p className="oc-muted">No month totals yet.</p>}
      <p className="oc-muted">Sponsored model accounting, not a provider credit balance.</p>
    </section>
    <div className="oc-usage-days" data-split={typeof model.perDay === 'object' || undefined}>
      <section className="oc-card" aria-labelledby="oc-per-day">
        <header className="oc-card__head"><h2 id="oc-per-day">Spend per day</h2><span className="oc-muted">UTC days</span></header>
        {typeof model.perDay === 'string' ? <p className="oc-muted">{model.perDay === 'loading' ? 'Loading.' : 'Per-day read unavailable.'}</p>
          : <SpendPerDay data={model.perDay} />}
      </section>
      {typeof model.perDay === 'object' && <SaverMode data={model.perDay} />}
    </div>
  </div>;
}

export const usageTab = defineTab({ id: 'usage', label: 'Usage', icon: 'balanceScale', reads: ['usage'],
  model: reads => usageModel(dataOf(reads.usage), cardRead(reads.usageDaily, perDayModel)),
  View: UsageView });
