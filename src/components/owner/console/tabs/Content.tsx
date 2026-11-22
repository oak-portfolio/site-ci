import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { defineTab } from '../tab.ts';
import { CopyBar, createLocalStore, Empty, LocalState, PublishPath, RecordsTable, VisibilityChip, type Column, type LocalRead, type Status } from '../local.tsx';

type Stage = 'draft' | 'review' | 'approved' | 'live' | 'answers';
type Item = { id: string; title: string; kind: string; status: string; channels: string[]; source: string; href: string | null;
  column: Stage; visibility: 'Draft' | 'Reviewed' | 'Public' };
type Body = { revision: string | null; contentIdentity?: string; approvedRevisions: number; items: Item[] };

export const contentStore = createLocalStore<Body>('/__owner/local/content', { revision: null, approvedRevisions: 0, items: [] });
const COMMAND = 'node scripts/knowledge/lifecycle.mjs owners';

const stages: (Status & { id: Stage })[] = [
  { id: 'draft', label: 'Private draft' },
  { id: 'review', label: 'In review', tone: 'watch' },
  { id: 'approved', label: 'Approved, not shown', tone: 'watch' },
  { id: 'live', label: 'Live on pages', tone: 'ok' },
  { id: 'answers', label: 'Live in answers only', tone: 'ok' },
];
const stageIcon = { draft: 'lock', review: 'view', approved: 'pause', live: 'globe', answers: 'sparkles' } as const;
const channelNames: Record<string, string> = { page: 'Page', answer: 'Answers', 'ai-files': 'AI files' };

const tableColumns: Column<Item>[] = [
  { key: 'title', label: 'Item', head: true, sort: row => row.title, cell: row => <span className="oc-title">{row.title}<small>{row.kind}, {row.source}</small></span> },
  { key: 'status', label: 'Status', sort: row => stages.findIndex(stage => stage.id === row.column), cell: row => <VisibilityChip value={row.visibility} /> },
  { key: 'stage', label: 'Stage', sort: row => row.column, cell: row => stages.find(stage => stage.id === row.column)?.label },
  { key: 'channels', label: 'Channels', sort: row => row.channels.length,
    cell: row => row.channels.length ? <span className="oc-tags">{row.channels.map(channel => <span key={channel} className="oc-chip">{channelNames[channel] ?? channel}</span>)}</span> : <span className="oc-muted">None</span> },
  { key: 'preview', label: 'Preview', cell: row => row.href ? <a className="oc-link" href={row.href} target="_blank" rel="noreferrer"><Icon name="arrowUpRight" size={14} />{row.href}</a> : <span className="oc-muted">No page</span> },
];

const statusCommand = (status: string) => (ids: string[]) =>
  `# Set status "${status}" with no channels for these Site library items in knowledge/owners.json (or draft: true in their Work MDX), then preview:\n# ${ids.join(', ')}\nnode scripts/knowledge/lifecycle.mjs preview`;

function Board({ items }: { items: Item[] }) {
  return <div className="oc-board" role="list" aria-label="Content board, private draft to live in answers only">
    {stages.map(stage => {
      const cards = items.filter(item => item.column === stage.id);
      return <section key={stage.id} className="oc-board__col" role="listitem" aria-labelledby={`oc-col-${stage.id}`}>
        <h3 id={`oc-col-${stage.id}`} className="oc-board__head"><span className="oc-asset"><Icon name={stageIcon[stage.id]} size={16} />{stage.label}</span><span>{cards.length}</span></h3>
        {cards.length ? cards.map(item => <article key={item.id} className="oc-board__card" aria-label={item.title}>
          <p>{item.title}</p>
          <span className="oc-tags"><VisibilityChip value={item.visibility} /></span>
          {item.href ? <a className="oc-link" href={item.href} target="_blank" rel="noreferrer"><Icon name="arrowUpRight" size={14} />Preview</a> : null}
        </article>) : <p className="oc-board__empty">Nothing here.</p>}
      </section>;
    })}
  </div>;
}

type Model = { read: LocalRead<Body> };

function ContentView({ model }: { model: Model }) {
  const [view, setView] = useState<'table' | 'board'>(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('content') === 'board' ? 'board' : 'table');
  const { read } = model;
  if (read.state !== 'ready') return <LocalState read={read} retry={contentStore.reload} what="the Site library" />;
  const { items } = read.body;
  return <div className="oc-stack">
    <div className="oc-toolbar">
      <div className="oc-seg" role="group" aria-label="Content view">
        {(['table', 'board'] as const).map(option => <button key={option} type="button" className="oc-seg__option" aria-pressed={view === option} onClick={() => setView(option)}>
          <Icon name={option === 'table' ? 'checkList' : 'dockRight'} size={16} />{option === 'table' ? 'Table' : 'Board'}</button>)}
      </div>
      <CopyBar label="Content" json={model} command={COMMAND} />
    </div>
    <p className="oc-muted">Every item moves left to right. Nothing reaches visitors until it is approved with its digest.</p>
    {!items.length ? <Empty icon="contentCreation" title="No Site library items" detail="knowledge/owners.json lists no owners and src/content/work has no case studies." />
      : view === 'board' ? <Board items={items} />
      : <RecordsTable label="Site library items" rows={items} columns={tableColumns} statuses={stages} statusOf={row => row.column}
        actions={[{ label: 'Send to review', icon: 'send', command: statusCommand('held') }, { label: 'Make private', icon: 'lock', command: statusCommand('draft') }]} />}
    <section className="oc-card" aria-labelledby="oc-publish">
      <header className="oc-card__head"><h2 id="oc-publish">Publish path</h2>
        {read.body.revision ? <span className="oc-chip" title={read.body.revision}><Icon name="fileVerified" size={14} />{read.body.approvedRevisions} approved revisions</span> : null}</header>
      <PublishPath />
    </section>
  </div>;
}

export const contentTab = defineTab<Model>({ id: 'content', label: 'Content', icon: 'contentCreation', reads: [], live: contentStore,
  model: () => ({ read: contentStore.getSnapshot() }), View: ContentView });
