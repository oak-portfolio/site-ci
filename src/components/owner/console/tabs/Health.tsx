import { MeterBar } from '@/components/ui/meter';
import { Icon } from '@/components/ui/Icon';
import { dataOf, type ReadData } from '../reads.ts';
import { defineTab, cardRead, type CardRead } from '../tab.ts';
import { clock, share, usd } from '../format.ts';

/** REVIEW-5: the retrieval store retains at most 16 generations. */
export const RETAINED_GENERATION_LIMIT = 16;
const serviceNames: Record<string, string> = { 'model-generation': 'Model answers', 'diagnostic-traces': 'LangSmith traces', transcription: 'Deepgram transcription',
  'public-research': 'Exa research', 'document-extraction': 'Document extraction', 'document-ocr': 'Document OCR', 'error-telemetry': 'Sentry errors',
  'product-analytics': 'PostHog events', 'semantic-retrieval': 'Semantic retrieval' };
const conditionNames: Record<string, string> = { disabled: 'Off', ready: 'Available', 'near-limit': 'Near limit', exhausted: 'Limit reached', blocked: 'Blocked',
  failure: 'Check service', stale: 'Outdated observation', unknown: 'Unknown', 'near-expiry': 'Expiring soon', 'swap-now': 'Swap now', expired: 'Expired' };
const conditionTones: Record<string, string | undefined> = { ready: 'ok', 'near-limit': 'watch', exhausted: 'danger', blocked: 'danger', failure: 'danger', stale: 'watch' };
const deliveryNames: Record<string, string> = { queued: 'Queued', sending: 'Sending', accepted: 'Accepted', 'provider-delivered': 'Delivered', 'inbox-observed': 'In inbox',
  'rate-limited': 'Rate limited', 'quota-exhausted': 'Email quota used up', failed: 'Failed', 'outcome-unknown': 'Outcome unknown' };
/** The read-only retirement-header op (`s-header-op`); it runs from Oak's terminal, never from this page. */
export const HEADER_OP = 'node scripts/quality/owner-read.mjs header=<64-hex candidate id>';

type Incident = ReadData<'services'>['alerting']['incidents'][number];
const alertRow = (incident: Incident) => ({ id: incident.id, service: serviceNames[incident.service] ?? incident.service,
  from: conditionNames[incident.from] ?? incident.from, to: conditionNames[incident.to] ?? incident.to, at: clock(incident.createdAt),
  delivery: deliveryNames[incident.delivery] ?? incident.delivery });
const alerts = (n: number) => n === 1 ? 'alert' : 'alerts';
const plural = (n: number) => `${n} ${alerts(n)}`;
const verdictParts: [string, (n: number) => string][] = [['exhausted', n => n === 1 ? '1 service at its limit' : `${n} services at their limit`],
  ['near-limit', n => `${n} near limit`], ['blocked', n => `${n} blocked`], ['failure', n => `${n} to check`], ['stale', n => `${n} outdated`],
  ['unknown', n => `${n} unknown`]];

export function verdictOf(conditions: string[]) {
  const parts = verdictParts.flatMap(([condition, say]) => { const n = conditions.filter(c => c === condition).length; return n ? [say(n)] : []; });
  return parts.length ? parts.join(', ') : 'No service at or near its limit';
}

/** The first page of the stored alert history. A held retrieval read keeps its Held mark and is never shown as settled. */
export function historyModel(history: ReadData<'alertHistory'>) {
  const n = history.items.length;
  return { summary: history.nextCursor ? `Newest ${plural(n)}. Older alerts are stored past this page.` : n ? `${n} stored ${alerts(n)}.` : 'No alerts stored.',
    rows: history.items.map(({ incident, held }) => ({ ...alertRow(incident), held })) };
}
type History = ReturnType<typeof historyModel>;

export function healthModel(services: ReadData<'services'> | null, history: CardRead<History>) {
  const retrieval = services?.services.find(row => row.status.service === 'semantic-retrieval');
  const generations = retrieval?.status.semanticRetrieval?.sqlite?.resources.generations;
  const used = generations ? generations.conservativeUsed ?? generations.localBound : null;
  const threshold = services?.alerting.thresholdPercent ?? 80;
  return {
    checkedAt: services ? clock(services.checkedAt) : null,
    verdict: services ? verdictOf(services.services.map(row => row.condition)) : null,
    monitoring: services ? { started: services.alerting.started, lastPoll: services.alerting.lastPollAt === null ? null : clock(services.alerting.lastPollAt) } : null,
    services: (services?.services ?? []).map(({ condition, status }) => ({ name: serviceNames[status.service] ?? status.service, condition,
      ...amounts(status.allowance) })),
    generations: used === null ? null : { used, limit: RETAINED_GENERATION_LIMIT, share: share(used, RETAINED_GENERATION_LIMIT),
      nearLimit: used * 100 >= RETAINED_GENERATION_LIMIT * threshold },
    incidents: (services?.alerting.incidents ?? []).map(alertRow),
    headerOp: HEADER_OP, history,
  };
}
type Model = ReturnType<typeof healthModel>;
const units: Record<string, string> = { 'root-traces': 'traces', 'audio-seconds': 's', emails: 'emails', 'conversion-attempts': 'attempts', 'telemetry-events': 'events', 'embedding-milli-neurons': 'mN' };
function amounts({ unit, conservativeUsed, reserved, limit }: { unit: string; conservativeUsed: number | null; reserved: number | null; limit: number | null }) {
  const show = (value: number | null) => value === null ? 'Unknown' : unit === 'micro-usd' ? usd(value) : `${value.toLocaleString('en-US')}${units[unit] ? ` ${units[unit]}` : ''}`;
  return { used: show(conservativeUsed), held: reserved === null ? 'None held' : `${show(reserved)} held`, limit: show(limit) };
}

function HealthView({ model }: { model: Model }) {
  return <div className="oc-stack">
    {model.verdict ? <p className="oc-muted" id="oc-verdict">{model.verdict}</p> : null}
    <div className="oc-grid oc-grid--2">
      <section className="oc-card" aria-labelledby="oc-generations">
        <header className="oc-card__head"><h2 id="oc-generations">Retained generations</h2>
          {model.generations ? <span className="oc-chip" data-tone={model.generations.nearLimit ? 'watch' : 'ok'}>{model.generations.nearLimit ? 'Near limit' : 'Room left'}</span> : null}</header>
        {model.generations ? <>
          <p className="oc-figure"><strong>{model.generations.used}</strong><span> of {model.generations.limit}, {model.generations.share}%</span></p>
          <span className="oc-meter" data-tone={model.generations.nearLimit ? 'watch' : 'ok'}><MeterBar value={model.generations.share} aria-label="Retained generations against the limit of 16" /></span>
        </> : <p className="oc-muted">No retained-generation reading.</p>}
      </section>
      <section className="oc-card" aria-labelledby="oc-header-op">
        <header className="oc-card__head"><h2 id="oc-header-op">Retirement header</h2><span className="oc-chip">Dry run</span></header>
        <p className="oc-muted">Run it from your terminal. As written it is a dry run: it prints the plan and runs nothing. Add <code>--apply</code> to read the header for real. That switches workers.dev on for the read and off again after.</p>
        <code className="oc-code">{model.headerOp}</code>
      </section>
    </div>
    <section className="oc-card" aria-labelledby="oc-services" aria-describedby={model.verdict ? 'oc-verdict' : undefined}>
      <header className="oc-card__head"><h2 id="oc-services">Services</h2><span className="oc-muted">{model.checkedAt ? `Checked ${model.checkedAt}` : ''}</span></header>
      <div className="oc-table" tabIndex={0} role="region" aria-label="Services, scroll for all columns">
        <table><thead><tr><th scope="col">Service</th><th scope="col">Condition</th><th scope="col">Used</th><th scope="col">Held</th><th scope="col">Limit</th></tr></thead>
          <tbody>{model.services.map(row => <tr key={row.name}><th scope="row">{row.name}</th>
            <td data-label="Condition"><span className="oc-chip" data-tone={conditionTones[row.condition]}>{conditionNames[row.condition] ?? row.condition}</span></td>
            <td data-label="Used">{row.used}</td><td data-label="Held">{row.held}</td><td data-label="Limit">{row.limit}</td></tr>)}</tbody></table>
      </div>
    </section>
    <section className="oc-card" aria-labelledby="oc-history">
      <header className="oc-card__head"><h2 id="oc-history">Alert history</h2>
        <span className="oc-muted">{model.monitoring ? model.monitoring.started ? `Monitoring on${model.monitoring.lastPoll ? `, last poll ${model.monitoring.lastPoll}` : ''}` : 'Monitoring off' : ''}</span></header>
      {typeof model.history === 'object' ? <AlertHistory history={model.history} /> : <>
        <p className="oc-muted">{model.history === 'loading' ? 'Loading alert history.' : 'Alert history unavailable.'}{model.incidents.length ? ` Showing the newest ${plural(model.incidents.length)} from the services read.` : ''}</p>
        {model.incidents.length ? <ol className="oc-list">{model.incidents.map(incident => <li key={incident.id} className="oc-list__row">
          <Icon name="flag" size={16} /><span className="oc-list__label">{incident.service}: {incident.from} to {incident.to}</span>
          <span className="oc-muted">{incident.at}</span><span className="oc-chip">{incident.delivery}</span></li>)}</ol> : null}
      </>}
    </section>
  </div>;
}

function AlertHistory({ history }: { history: History }) {
  return <>
    <p className="oc-muted">{history.summary}</p>
    {history.rows.length ? <div className="oc-table" tabIndex={0} role="region" aria-label="Alert history, scroll for all columns">
      <table><thead><tr><th scope="col">Service</th><th scope="col">Now</th><th scope="col">Was</th><th scope="col">When</th><th scope="col">Email</th></tr></thead>
        <tbody>{history.rows.map(row => <tr key={row.id}><th scope="row">{row.service}</th>
          <td data-label="Now">{row.to}{row.held ? <> <span className="oc-chip" data-tone="watch" title="A held read, not a settled reading">Held</span></> : null}</td>
          <td data-label="Was">{row.from}</td><td data-label="When">{row.at}</td><td data-label="Email">{row.delivery}</td></tr>)}</tbody></table>
    </div> : null}
  </>;
}

export const healthTab = defineTab({ id: 'health', label: 'Health', icon: 'securityCheck', reads: ['services'],
  model: reads => healthModel(dataOf(reads.services), cardRead(reads.alertHistory, historyModel)), View: HealthView });
