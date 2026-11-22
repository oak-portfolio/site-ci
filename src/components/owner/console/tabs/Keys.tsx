import { Icon } from '@/components/ui/Icon';
import { MeterBar } from '@/components/ui/meter';
import { dataOf, type ReadData } from '../reads.ts';
import { defineTab } from '../tab.ts';
import { day, usd } from '../format.ts';

type Slot = ReadData<'keys'>['providers'][number]['queue'][number];
export type KeyState = 'healthy' | 'running-low' | 'spent' | 'no-spare' | 'empty';
const providerNames = { openrouter: 'OpenRouter', exa: 'Exa', deepgram: 'Deepgram' } as const;
const stateNames: Record<KeyState, string> = { healthy: 'Healthy', 'running-low': 'Running low', spent: 'Spent', 'no-spare': 'No spare', empty: 'No key' };
const stateTones: Record<KeyState, string> = { healthy: 'ok', 'running-low': 'watch', spent: 'danger', 'no-spare': 'watch', empty: 'danger' };
const spent = (slot: Slot) => slot.state === 'exhausted' || slot.remainingMicroUsd === 0;

function keyState(active: Slot | null, spares: number): KeyState {
  if (!active) return 'empty';
  if (spent(active)) return 'spent';
  if ((active.percentUsed ?? 0) >= 80) return 'running-low';
  return spares ? 'healthy' : 'no-spare';
}
const runway = (slot: Slot) => spent(slot) ? 'Credit used up' : slot.runwayDays === null ? 'Runway unknown until it has spent for a day' : `About ${slot.runwayDays} days of runway`;

export function keysModel(keys: ReadData<'keys'> | null, grants: ReadData<'grants'> | null) {
  return {
    providers: (keys?.providers ?? []).map(({ provider, active, queue, history }) => ({
      provider, name: providerNames[provider], state: keyState(active, queue.length),
      active: active && { label: active.label, last4: active.last4, left: usd(active.remainingMicroUsd), of: active.knownCreditMicroUsd === null ? null : usd(active.knownCreditMicroUsd),
        percentUsed: active.percentUsed, runway: runway(active), spent: spent(active) },
      spares: queue.map(slot => ({ id: slot.slotId, position: slot.position, label: slot.label, last4: slot.last4, credit: slot.knownCreditMicroUsd === null ? null : usd(slot.knownCreditMicroUsd), tested: slot.testedAt !== null })),
      spentKeys: history.filter(spent).map(slot => ({ id: slot.slotId, label: slot.label, last4: slot.last4, endedAt: slot.endedAt === null ? null : day(slot.endedAt), reason: slot.reason })),
    })),
    vertex: (keys?.vertex ?? []).map(budget => ({ id: budget.budgetId, name: budget.name, spent: usd(budget.costMicroUsd), of: usd(budget.budgetMicroUsd), percentUsed: Math.round(budget.percentUsed) })),
    grants: grants && grants.map(grant => ({ id: grant.id, label: grant.label ?? 'Unlabelled grant', answers: grant.answers, status: grant.status, created: day(grant.createdAt), expires: day(grant.expiresAt) })),
  };
}
type Model = ReturnType<typeof keysModel>;

const Last4 = ({ last4 }: { last4: string }) => <span className="oc-key"><Icon name="key" size={14} />ending {last4}</span>;

function KeysView({ model }: { model: Model }) {
  return <div className="oc-stack">
    <div className="oc-grid oc-grid--3">
      {model.providers.map(provider => <article key={provider.provider} className="oc-card" aria-labelledby={`oc-key-${provider.provider}`}>
        <header className="oc-card__head">
          <h2 id={`oc-key-${provider.provider}`}>{provider.name}</h2>
          <span className="oc-chip" data-tone={stateTones[provider.state]}>{stateNames[provider.state]}</span>
        </header>
        {provider.active ? <>
          <div className="oc-row"><Last4 last4={provider.active.last4} /><span className="oc-muted">{provider.active.label}</span></div>
          <p className="oc-figure"><strong>{provider.active.left}</strong><span>{provider.active.of ? ` left of ${provider.active.of}` : ' left'}</span></p>
          <span className="oc-meter" data-tone={provider.state === 'spent' ? 'danger' : provider.state === 'running-low' ? 'watch' : 'ok'}>
            <MeterBar value={Math.min(100, provider.active.percentUsed ?? 0)} aria-label={`${provider.name} credit used`} /></span>
          <p className="oc-muted">{provider.active.percentUsed === null ? 'Usage unknown' : `${provider.active.percentUsed}% used`}, {provider.active.runway}</p>
        </> : <p className="oc-muted">No active key. Add one with the key queue CLI.</p>}
        {provider.spares.length ? <ol className="oc-list" aria-label={`${provider.name} spares`}>
          {provider.spares.map(spare => <li key={spare.id} className="oc-list__row">
            <span className="oc-list__pos">{spare.position}</span><Last4 last4={spare.last4} /><span className="oc-list__label">{spare.label}</span>
            <span className="oc-list__value">{spare.credit ?? 'Credit unknown'}</span>
            <span className="oc-chip">{spare.tested ? 'Queued, tested' : 'Queued'}</span>
          </li>)}
        </ol> : <p className="oc-note"><Icon name="info" size={16} />No tested spare. Add one before the active key runs out.</p>}
        {provider.spentKeys.map(key => <p key={key.id} className="oc-row oc-muted"><span className="oc-chip" data-tone="danger">Spent</span><Last4 last4={key.last4} />{key.endedAt ? `ended ${key.endedAt}` : ''}</p>)}
      </article>)}
    </div>
    {model.vertex.map(budget => <article key={budget.id} className="oc-card" aria-label={`Vertex spend, ${budget.name}`}>
      <header className="oc-card__head"><h2>Vertex spend</h2><span className="oc-muted">{budget.name}</span></header>
      <p className="oc-figure"><strong>{budget.spent}</strong><span> of {budget.of}, {budget.percentUsed}% used</span></p>
      <span className="oc-meter" data-tone={budget.percentUsed >= 80 ? 'watch' : 'ok'}><MeterBar value={Math.min(100, budget.percentUsed)} aria-label={`Vertex ${budget.name} budget used`} /></span>
    </article>)}
    <section className="oc-card" aria-labelledby="oc-grants">
      <header className="oc-card__head"><h2 id="oc-grants">Grant codes</h2><span className="oc-muted">Codes are shown once, when made. This list never holds them.</span></header>
      {model.grants === null ? <p className="oc-muted">Grant list unavailable.</p> : model.grants.length === 0 ? <p className="oc-muted">No grant codes yet.</p> :
        <div className="oc-table" tabIndex={0} role="region" aria-label="Grant codes, scroll for all columns">
          <table><thead><tr><th scope="col">Label</th><th scope="col">Answers</th><th scope="col">Status</th><th scope="col">Made</th><th scope="col">Expires</th></tr></thead>
            <tbody>{model.grants.map(grant => <tr key={grant.id}><th scope="row">{grant.label}</th><td data-label="Answers">{grant.answers}</td>
              <td data-label="Status"><span className="oc-chip" data-tone={grant.status === 'active' ? 'ok' : undefined}>{grant.status[0]!.toUpperCase() + grant.status.slice(1)}</span></td>
              <td data-label="Made">{grant.created}</td><td data-label="Expires">{grant.expires}</td></tr>)}</tbody></table>
        </div>}
    </section>
  </div>;
}

export const keysTab = defineTab({ id: 'keys', label: 'Keys', icon: 'key', reads: ['keys', 'grants'],
  model: reads => keysModel(dataOf(reads.keys), dataOf(reads.grants)), View: KeysView });
