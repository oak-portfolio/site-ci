import type { ReadData } from '../reads.ts';
import { defineTab, cardRead, type CardRead } from '../tab.ts';
import { day } from '../format.ts';
import { Icon } from '@/components/ui/Icon';
import { CopyBar, createLocalStore, LocalState, type LocalRead } from '../local.tsx';

type Local = { branch: string | null; ahead: number | null; behind: number | null; changed: number; commits: { sha: string; subject: string; at: string }[];
  pulls: { number: number; title: string; draft: boolean; branch: string; url: string }[] | null; pullsError: string | null;
  premium: string | null; premiumError: string | null; reviewServer: { url: string; up: boolean; command: string } };
export const releaseStore = createLocalStore<Local>('/__owner/local/release', { branch: null, ahead: null, behind: null, changed: 0, commits: [], pulls: [], pullsError: null,
  premium: null, premiumError: null, reviewServer: { url: 'http://127.0.0.1:4399/', up: false, command: 'node scripts/quality/review-server.mjs' } });
const COMMAND = 'git status --short --branch && gh pr list --author @me && npm run -s premium -- --brief';

/** The runs read returns the newest 50 cases and no total, so a full page cannot say how many exist. */
export const RUNS_READ_LIMIT = 50;
const originNames: Record<string, string> = { 'owner-authored': 'Owner-authored', synthetic: 'Synthetic' };
const stateNames: Record<string, string> = { registered: 'Registered', admitted: 'Admitted', revoked: 'Revoked', expired: 'Expired' };
const stateTones: Record<string, string | undefined> = { admitted: 'ok', revoked: 'danger', expired: 'watch' };

export function runsModel({ runs }: ReadData<'evaluationRuns'>) {
  const n = runs.length;
  return { summary: n >= RUNS_READ_LIMIT ? `Newest ${RUNS_READ_LIMIT} evaluation cases.` : n ? `${n} evaluation ${n === 1 ? 'case' : 'cases'} on record.` : 'No evaluation cases on record.',
    counts: n ? (['admitted', 'registered', 'revoked', 'expired'] as const).map(state => ({ state, name: stateNames[state], n: runs.filter(run => run.state === state).length })) : [],
    rows: runs.map(run => ({ id: run.caseId, short: run.caseId.slice(0, 12), origin: originNames[run.origin] ?? run.origin, state: run.state,
      stateName: stateNames[run.state] ?? run.state, created: day(run.createdAt), expires: run.expiresAt === null ? 'No expiry' : day(run.expiresAt) })) };
}
type Runs = ReturnType<typeof runsModel>;
type Model = { evaluationRuns: CardRead<Runs>; local: LocalRead<Local> };

function LocalRelease({ read, model }: { read: LocalRead<Local>; model: Model }) {
  if (read.state !== 'ready') return <LocalState read={read} retry={releaseStore.reload} what="git, GitHub and review-server state" />;
  const local = read.body;
  return <>
    <section className="oc-card" aria-labelledby="oc-git">
      <header className="oc-card__head"><h2 id="oc-git">This checkout</h2><CopyBar label="Review and release" json={model} command={COMMAND} /></header>
      <dl className="oc-grid oc-grid--4">
        <div className="oc-tile"><dt><Icon name="openSource" size={16} />Branch</dt><dd className="oc-release__branch">{local.branch ?? 'Detached'}</dd></div>
        <div className="oc-tile"><dt>Ahead</dt><dd>{local.ahead ?? 'n/a'}</dd></div>
        <div className="oc-tile"><dt>Behind</dt><dd>{local.behind ?? 'n/a'}</dd></div>
        <div className="oc-tile"><dt>Changed files</dt><dd>{local.changed}</dd></div>
      </dl>
      {local.commits.length ? <ul className="oc-list">{local.commits.map(commit => <li key={commit.sha} className="oc-list__row">
        <span className="oc-title">{commit.subject}<small><code>{commit.sha}</code>, {day(Date.parse(commit.at))}</small></span></li>)}</ul> : <p className="oc-muted">No commits.</p>}
    </section>
    <section className="oc-card" aria-labelledby="oc-prs">
      <header className="oc-card__head"><h2 id="oc-prs">My open pull requests</h2>
        <a className="oc-link" href={local.reviewServer.url} target="_blank" rel="noreferrer" title={local.reviewServer.up ? 'Review server is running' : `Start it: ${local.reviewServer.command}`}>
          <span className="oc-chip" data-tone={local.reviewServer.up ? 'ok' : 'watch'}>{local.reviewServer.up ? 'Review server up' : 'Review server down'}</span></a></header>
      {local.pulls === null ? <p className="oc-muted">GitHub unavailable: {local.pullsError}. Run <code>gh auth status</code>.</p>
        : local.pulls.length ? <ul className="oc-list">{local.pulls.map(pr => <li key={pr.number} className="oc-list__row">
          <a className="oc-link" href={pr.url} target="_blank" rel="noreferrer"><Icon name="arrowUpRight" size={14} />#{pr.number} {pr.title}</a>
          {pr.draft ? <span className="oc-chip">Draft</span> : <span className="oc-chip" data-tone="ok">Ready</span>}
        </li>)}</ul> : <p className="oc-muted">No open pull requests.</p>}
    </section>
    <section className="oc-card" aria-labelledby="oc-premium">
      <header className="oc-card__head"><h2 id="oc-premium">Premium round</h2></header>
      {local.premium ? <pre className="oc-brief" tabIndex={0}>{local.premium}</pre> : <p className="oc-muted">The brief did not run: {local.premiumError}. Run <code>npm run -s premium -- --brief</code>.</p>}
    </section>
  </>;
}

function ReleaseView({ model }: { model: Model }) {
  const runs = model.evaluationRuns;
  return <div className="oc-stack">
    <LocalRelease read={model.local} model={model} />
    <section className="oc-card" aria-labelledby="oc-runs">
      <header className="oc-card__head"><h2 id="oc-runs">Evaluation cases</h2></header>
      {typeof runs === 'object' ? <>
        <p className="oc-muted">{runs.summary}</p>
        {runs.counts.length ? <dl className="oc-grid oc-grid--4">{runs.counts.map(count => <div key={count.state} className="oc-tile">
          <dt>{count.name}</dt><dd>{count.n}</dd></div>)}</dl> : null}
        {runs.rows.length ? <div className="oc-table" tabIndex={0} role="region" aria-label="Evaluation cases, scroll for all columns">
          <table><thead><tr><th scope="col">Case</th><th scope="col">Origin</th><th scope="col">State</th><th scope="col">Created</th><th scope="col">Expires</th></tr></thead>
            <tbody>{runs.rows.map(row => <tr key={row.id}><th scope="row"><code>{row.short}</code></th><td data-label="Origin">{row.origin}</td>
              <td data-label="State"><span className="oc-chip" data-tone={stateTones[row.state]}>{row.stateName}</span></td><td data-label="Created">{row.created}</td><td data-label="Expires">{row.expires}</td></tr>)}</tbody></table>
        </div> : null}
      </> : <p className="oc-muted">{runs === 'loading' ? 'Loading evaluation cases.' : 'Evaluation cases unavailable.'}</p>}
    </section>
  </div>;
}

export const releaseTab = defineTab<Model>({ id: 'release', label: 'Review and release', icon: 'send', reads: ['evaluationRuns'], live: releaseStore,
  model: reads => ({ evaluationRuns: cardRead(reads.evaluationRuns, runsModel), local: releaseStore.getSnapshot() }), View: ReleaseView });
