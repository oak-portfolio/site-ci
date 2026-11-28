import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MeterBar } from '@/components/ui/meter';
import { defineTab } from '../tab.ts';
import { CopyBar, createLocalStore, Empty, LocalState, type LocalRead } from '../local.tsx';

type Run = { id: string; name: string; status: 'ok' | 'error' | 'pending'; start: string | null; latencyMs: number | null; tokens: number | null; link: string | null; components: string[] };
type Body = { project: string; since: string; counts: { total: number; ok: number; error: number; pending: number }; runs: Run[] };

export const tracesStore = createLocalStore<Body>('/__owner/local/traces', { project: '', since: '', counts: { total: 0, ok: 0, error: 0, pending: 0 }, runs: [] });
const COMMAND = `langsmith api /api/v2/runs/query --format json -X POST --input - <<< "{\\"project_ids\\":[\\"1e150573-20a8-4ac6-a75b-6722468adb7a\\"],\\"is_root\\":true,\\"min_start_time\\":\\"$(date -u -v-7d +%Y-%m-%dT%H:%M:%SZ)\\",\\"page_size\\":50,\\"selects\\":[\\"ID\\",\\"NAME\\",\\"STATUS\\",\\"START_TIME\\",\\"END_TIME\\"]}"`;

const statusName = { ok: 'Ok', error: 'Failed', pending: 'Running' } as const;
const statusTone = { ok: 'ok', error: 'danger', pending: 'watch' } as const;
const seconds = (ms: number | null) => ms === null ? 'n/a' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
const when = (iso: string | null) => iso ? new Date(iso.endsWith('Z') ? iso : `${iso}Z`).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'n/a';

type Model = { read: LocalRead<Body> };

function TracesView({ model }: { model: Model }) {
  const [filter, setFilter] = useState<Run['status'] | null>(null);
  const { read } = model;
  if (read.state !== 'ready') return <LocalState read={read} retry={tracesStore.reload} what="LangSmith traces" />;
  const { counts, runs } = read.body;
  const shown = filter ? runs.filter(run => run.status === filter) : runs;
  return <div className="oc-stack">
    <div className="oc-toolbar">
      <p className="oc-muted">Oak turns from the Oakfolio diagnostics project, last 7 days. Status, timing and links only; never message text or keys.</p>
      <CopyBar label="Traces" json={model} command={COMMAND} />
    </div>
    {!runs.length ? <Empty icon="schemaMap" title="No turns in the last 7 days" detail="LangSmith answered, but the project has no root runs in this window." /> : <>
      <section className="oc-card" aria-labelledby="oc-trace-sum">
        <header className="oc-card__head"><h2 id="oc-trace-sum">Turns by outcome</h2>
          {counts.error ? <span className="oc-chip" data-tone="danger">{counts.error} failed</span> : <span className="oc-chip" data-tone="ok">No failures</span>}</header>
        <ul className="oc-bars-list">{(['ok', 'error', 'pending'] as const).map(state => <li key={state}>
          <span>{statusName[state]}</span>
          <span className="oc-meter" data-tone={statusTone[state] === 'ok' ? 'ok' : 'watch'}><MeterBar value={counts[state]} max={Math.max(1, counts.total)} aria-label={`${statusName[state]} turns`} /></span>
          <span>{counts[state]} of {counts.total}</span>
        </li>)}</ul>
      </section>
      <div className="oc-records__chips" role="group" aria-label="Filter turns by outcome">
        <button type="button" className="oc-filter" aria-pressed={filter === null} onClick={() => setFilter(null)}>All <span>{runs.length}</span></button>
        {(['ok', 'error', 'pending'] as const).map(state => <button key={state} type="button" className="oc-filter" aria-pressed={filter === state}
          onClick={() => setFilter(current => current === state ? null : state)}>{statusName[state]} <span>{counts[state]}</span></button>)}
      </div>
      <div className="oc-table" tabIndex={0} role="region" aria-label="Recent turns, scroll for all columns">
        <table><thead><tr><th scope="col">Turn</th><th scope="col">Outcome</th><th scope="col">Started</th><th scope="col">Latency</th><th scope="col">Tokens</th><th scope="col">LangSmith</th></tr></thead>
          <tbody>{shown.map(run => <tr key={run.id}>
            <th scope="row"><span className="oc-title">{run.name}<small><code>{run.id.slice(0, 8)}</code></small></span></th>
            <td data-label="Outcome"><span className="oc-chip" data-tone={statusTone[run.status]}>{statusName[run.status]}</span></td>
            <td data-label="Started">{when(run.start)}</td>
            <td data-label="Latency">{seconds(run.latencyMs)}</td>
            <td data-label="Tokens">{run.tokens ?? <span className="oc-muted">n/a</span>}</td>
            <td data-label="LangSmith">{run.link ? <a className="oc-link" href={run.link} target="_blank" rel="noreferrer"><Icon name="arrowUpRight" size={14} />Open</a> : <span className="oc-muted">No link</span>}</td>
          </tr>)}</tbody></table>
      </div>
    </>}
  </div>;
}

export const tracesTab = defineTab<Model>({ id: 'traces', label: 'Traces', icon: 'schemaMap', reads: [], live: tracesStore,
  model: () => ({ read: tracesStore.getSnapshot() }), View: TracesView });
