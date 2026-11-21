import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { LiveSource } from './tab.ts';
import { Unreachable } from './views.tsx';
import './local.css';

/** What a local read shows. `error` means the dev server answered with a reason (a CLI failed); `unreachable` means it did not answer. */
export type LocalRead<T> =
  | { state: 'idle' | 'loading' }
  | { state: 'ready'; body: T; at: number }
  | { state: 'error'; error: string; at: number }
  | { state: 'unreachable'; at: number };

const stillParam = () => typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('local');

/**
 * A same-origin read of one `/__owner/local/*` dev-server route. `?local=empty|error|unreachable` draws that state without a
 * request, for stills and design review.
 */
export function createLocalStore<T>(path: string, emptyBody: T): Omit<LiveSource, 'getSnapshot'> & { getSnapshot: () => LocalRead<T> } {
  const idle: LocalRead<T> = { state: 'idle' };
  let snapshot: LocalRead<T> = idle;
  const listeners = new Set<() => void>();
  const put = (next: LocalRead<T>) => { snapshot = next; listeners.forEach(listener => listener()); };
  async function read() {
    const still = stillParam();
    if (still === 'empty') return put({ state: 'ready', body: emptyBody, at: Date.now() });
    if (still === 'error') return put({ state: 'error', error: 'fixture-error', at: Date.now() });
    if (still === 'unreachable') return put({ state: 'unreachable', at: Date.now() });
    put({ state: 'loading' });
    try {
      const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(45_000) });
      if (!response.headers.get('content-type')?.startsWith('application/json')) return put({ state: 'unreachable', at: Date.now() });
      const body = await response.json() as T & { error?: string };
      put(response.ok ? { state: 'ready', body, at: Date.now() } : { state: 'error', error: String(body.error ?? response.status), at: Date.now() });
    } catch {
      put({ state: 'unreachable', at: Date.now() });
    }
  }
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => idle,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load: () => { if (snapshot.state === 'idle') void read(); },
    reload: () => { if (snapshot.state !== 'loading') void read(); },
  };
}

const errorHelp: Record<string, string> = {
  'langsmith-unavailable': 'The langsmith CLI is not installed on this machine.',
  'langsmith-failed': 'The langsmith CLI is not signed in, or LangSmith refused the query. Run langsmith auth login.',
  'gh-failed': 'The gh CLI is not signed in. Run gh auth login.',
  'lifecycle-failed': 'The Site library check failed. Run node scripts/knowledge/lifecycle.mjs owners to see why.',
  withheld: 'The answer held something shaped like a key, so the dev server withheld it.',
  'fixture-error': 'Fixture: the dev server answered with a reason instead of data.',
};

/** The non-ready states every local tab shares. Returns null when the read is ready. */
export function LocalState<T>({ read, retry, what }: { read: LocalRead<T>; retry: () => void; what: string }) {
  if (read.state === 'ready') return null;
  if (read.state === 'unreachable') return <Unreachable retry={retry} />;
  if (read.state === 'error') return <section className="oc-state" aria-labelledby="oc-local-error" data-state="error">
    <span className="oc-state__icon"><Icon name="alert" size={22} /></span>
    <h2 id="oc-local-error">Could not read {what}</h2>
    <p className="oc-muted">{errorHelp[read.error] ?? `The dev server answered ${read.error}.`}</p>
    <Button variant="secondary" onClick={retry}><Icon name="retry" size={16} />Retry</Button>
  </section>;
  return <p className="oc-muted" role="status">Reading {what} from this machine.</p>;
}

export function Empty({ icon, title, detail }: { icon: IconName; title: string; detail: ReactNode }) {
  return <div className="oc-notyet" data-state="empty">
    <span className="oc-state__icon"><Icon name={icon} size={20} /></span>
    <div><p className="oc-notyet__title">{title}</p><p className="oc-muted">{detail}</p></div>
  </div>;
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, text: string) => void navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1600); });
  return { copied, copy };
}

/** "Copy as JSON" and "Copy command" for one tab: the JSON is the tab's model, the command is the terminal read behind it. */
export function CopyBar({ label, json, command }: { label: string; json: unknown; command: string }) {
  const { copied, copy } = useCopy();
  return <div className="oc-copybar" role="group" aria-label={`${label} exports`}>
    <Button variant="secondary" size="sm" onClick={() => copy('json', JSON.stringify(json, null, 2))} title={`Copy the ${label} tab as JSON`}>
      <Icon name={copied === 'json' ? 'copyCheck' : 'code'} size={16} />{copied === 'json' ? 'Copied' : 'Copy as JSON'}
    </Button>
    <Button variant="secondary" size="sm" onClick={() => copy('cmd', command)} title={command}>
      <Icon name={copied === 'cmd' ? 'copyCheck' : 'copy'} size={16} />{copied === 'cmd' ? 'Copied' : 'Copy command'}
    </Button>
  </div>;
}

export type Column<R> = { key: string; label: string; sort?: (row: R) => string | number; cell: (row: R) => ReactNode; head?: boolean };
export type Status = { id: string; label: string; tone?: 'ok' | 'watch' | 'danger' };
export type BulkAction = { label: string; icon: IconName; command: (ids: string[]) => string };

/**
 * The one records table Content and Assets share: sortable columns (aria-sort), select-all with a mixed state, an
 * "N selected" bar whose actions copy a command, and status chips that filter rows out (never fade them).
 */
export function RecordsTable<R extends { id: string }>({ label, rows, columns, statuses, statusOf, actions, onOpen }: {
  label: string; rows: R[]; columns: Column<R>[]; statuses: Status[]; statusOf: (row: R) => string; actions: BulkAction[]; onOpen?: (row: R) => void;
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const { copied, copy } = useCopy();
  const shown = useMemo(() => {
    const kept = filter ? rows.filter(row => statusOf(row) === filter) : rows;
    const by = sort && columns.find(column => column.key === sort.key)?.sort;
    return by && sort ? [...kept].sort((a, b) => (by(a) > by(b) ? 1 : by(a) < by(b) ? -1 : 0) * sort.dir) : kept;
  }, [rows, filter, sort, columns, statusOf]);
  const picked = shown.filter(row => selected.has(row.id));
  const all = shown.length > 0 && picked.length === shown.length;
  const toggle = (id: string, on: boolean) => setSelected(current => { const next = new Set(current); on ? next.add(id) : next.delete(id); return next; });
  const toggleSort = (key: string) => setSort(current => current?.key === key ? (current.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 });

  return <div className="oc-records">
    <div className="oc-records__chips" role="group" aria-label={`Filter ${label} by status`}>
      <button type="button" className="oc-filter" aria-pressed={filter === null} onClick={() => setFilter(null)}>All <span>{rows.length}</span></button>
      {statuses.map(status => <button key={status.id} type="button" className="oc-filter" data-tone={status.tone} aria-pressed={filter === status.id}
        onClick={() => setFilter(current => current === status.id ? null : status.id)}>
        {status.label} <span>{rows.filter(row => statusOf(row) === status.id).length}</span>
      </button>)}
    </div>
    {picked.length ? <div className="oc-records__bar" role="region" aria-label="Selection">
      <strong>{picked.length} selected</strong>
      <div className="oc-records__actions">
        {actions.map(action => <Button key={action.label} variant="secondary" size="sm" title={`Copies the command; nothing changes until you run it`}
          onClick={() => copy(action.label, action.command(picked.map(row => row.id)))}>
          <Icon name={copied === action.label ? 'copyCheck' : action.icon} size={16} />{copied === action.label ? 'Command copied' : action.label}
        </Button>)}
        <Button variant="ghost" size="icon" aria-label="Clear selection" title="Clear selection" onClick={() => setSelected(new Set())}><Icon name="cancel" size={16} /></Button>
      </div>
    </div> : null}
    <div className="oc-table oc-records__table" tabIndex={0} role="region" aria-label={`${label}, scroll for all columns`}>
      <table>
        <thead><tr>
          <th scope="col" className="oc-records__check">
            <Checkbox aria-label={`Select all ${shown.length} shown`} checked={all} indeterminate={picked.length > 0 && !all}
              onCheckedChange={on => setSelected(on ? new Set(shown.map(row => row.id)) : new Set())} />
          </th>
          {columns.map(column => <th key={column.key} scope="col" aria-sort={column.sort ? sort?.key === column.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none' : undefined}>
            {column.sort ? <button type="button" className="oc-sort" data-dir={sort?.key === column.key ? (sort.dir === 1 ? 'asc' : 'desc') : undefined}
              onClick={() => toggleSort(column.key)}>{column.label}<Icon name="arrowDown" size={14} /></button> : column.label}
          </th>)}
          {onOpen ? <th scope="col"><span className="oc-sr">Open</span></th> : null}
        </tr></thead>
        <tbody>{shown.map(row => <tr key={row.id} aria-selected={selected.has(row.id)}>
          <td className="oc-records__check" data-label="Select">
            <Checkbox aria-label={`Select ${row.id}`} checked={selected.has(row.id)} onCheckedChange={on => toggle(row.id, on)} />
          </td>
          {columns.map(column => column.head
            ? <th key={column.key} scope="row">{column.cell(row)}</th>
            : <td key={column.key} data-label={column.label}>{column.cell(row)}</td>)}
          {onOpen ? <td data-label="Details"><Button variant="ghost" size="icon" aria-label={`Open ${row.id}`} title="Open details" onClick={() => onOpen(row)}><Icon name="chevronRight" size={16} /></Button></td> : null}
        </tr>)}</tbody>
      </table>
      {!shown.length ? <p className="oc-muted oc-records__none">No rows match this filter.</p> : null}
    </div>
  </div>;
}

const publishSteps = [
  { name: 'Draft', detail: 'Edit the owner file or Work MDX.' },
  { name: 'Review', detail: 'node scripts/knowledge/lifecycle.mjs preview' },
  { name: 'Approve', detail: 'lifecycle.mjs approve <candidate> --digest <sha256>, typed in a terminal' },
  { name: 'Publish', detail: 'Merge to main; Cloudflare Pages deploys.' },
];
export function PublishPath() {
  return <ol className="oc-path" aria-label="Publish path">{publishSteps.map((step, i) => <li key={step.name}>
    <span className="oc-path__n">{i + 1}</span><div><p className="oc-path__name">{step.name}</p><p className="oc-muted"><code>{step.detail}</code></p></div>
  </li>)}</ol>;
}

export const VisibilityChip = ({ value }: { value: 'Draft' | 'Reviewed' | 'Public' }) =>
  <span className="oc-chip" data-tone={value === 'Public' ? 'ok' : value === 'Reviewed' ? 'watch' : undefined}>
    <Icon name={value === 'Public' ? 'globe' : value === 'Reviewed' ? 'verify' : 'lock'} size={14} />{value}
  </span>;
