import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/Icon';
import { consoleReads, fetchOutcome, initialReads, settle, type ReadName, type Reads } from './reads.ts';
import { fixtureNames, fixtureReads, type FixtureName } from './fixtures.ts';
import type { ConsoleTab } from './tab.ts';
import { JsonView, SignedOut, StaleBar, Unreachable } from './views.tsx';
import { overviewTab } from './tabs/Overview.tsx';
import { keysTab } from './tabs/Keys.tsx';
import { usageTab } from './tabs/Usage.tsx';
import { healthTab } from './tabs/Health.tsx';
import { contentTab } from './tabs/Content.tsx';
import { assetsTab } from './tabs/Assets.tsx';
import { tracesTab } from './tabs/Traces.tsx';
import { qualityTab } from './tabs/Quality.tsx';
import { releaseTab } from './tabs/Release.tsx';
import { publicResourcesTab } from './tabs/PublicResources.tsx';

export const consoleTabs: readonly ConsoleTab[] = [overviewTab, keysTab, usageTab, healthTab, contentTab, assetsTab, tracesTab, qualityTab, releaseTab, publicResourcesTab];
type View = 'tab' | 'json';

const param = (key: string) => typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(key);
const never = () => () => {};
const nothing = () => null;
const fixtureParam = (): FixtureName | null => fixtureNames.find(name => name === param('fixture')) ?? null;

/** What the tab body shows, from the state of the reads it depends on. */
function frame(tab: ConsoleTab, reads: Reads) {
  const own = tab.reads.map(name => reads[name]);
  const signedOut = own.find(read => read.kind === 'signed-out');
  if (signedOut?.kind === 'signed-out') return { kind: 'signed-out' as const, reason: signedOut.reason };
  if (own.length && own.every(read => read.kind === 'loading')) return { kind: 'loading' as const };
  if (own.length && own.every(read => read.kind === 'unreachable' && !read.last)) return { kind: 'unreachable' as const };
  const staleAt = own.flatMap(read => read.kind === 'unreachable' && read.last ? [read.last.at] : []);
  return { kind: 'shown' as const, staleAt: staleAt.length ? Math.min(...staleAt) : null };
}
const isStale = (tab: ConsoleTab, reads: Reads) => tab.reads.some(name => reads[name].kind === 'unreachable');

export function OwnerConsole({ initialTab, initialReads: given, initialView }: { initialTab?: string; initialReads?: Reads; initialView?: View }) {
  const [fixture] = useState(fixtureParam);
  const [tabId, setTabId] = useState(() => initialTab ?? consoleTabs.find(tab => tab.id === param('tab'))?.id ?? 'overview');
  const [view, setView] = useState<View>(() => initialView ?? (param('view') === 'json' ? 'json' : 'tab'));
  const [reads, setReads] = useState<Reads>(() => given ?? (fixture ? fixtureReads(fixture, Date.now()) : initialReads()));

  const load = useCallback((names: readonly ReadName[]) => {
    if (fixture) { setReads(fixtureReads(fixture, Date.now())); return; }
    for (const name of names) void fetchOutcome(consoleReads[name].path).then(outcome =>
      setReads(current => ({ ...current, [name]: settle(name, current[name], outcome, Date.now()) })));
  }, [fixture]);
  useEffect(() => { if (!given) load(Object.keys(consoleReads) as ReadName[]); }, [given, load]);

  const navigate = (next: { tab?: string; view?: View }) => {
    if (next.tab) setTabId(next.tab);
    if (next.view) setView(next.view);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (next.tab) url.searchParams.set('tab', next.tab);
    if (next.view) next.view === 'json' ? url.searchParams.set('view', 'json') : url.searchParams.delete('view');
    window.history.replaceState(null, '', url);
  };
  const tab = consoleTabs.find(candidate => candidate.id === tabId) ?? consoleTabs[0]!;
  const live = tab.live;
  useSyncExternalStore(live?.subscribe ?? never, live?.getSnapshot ?? nothing, live?.getServerSnapshot ?? nothing);
  useEffect(() => { live?.load(); }, [live]);
  const retry = () => { live?.reload(); load(tab.reads.length ? tab.reads : Object.keys(consoleReads) as ReadName[]); };
  const shown = frame(tab, reads);

  return <Tabs.Root value={tab.id} onValueChange={value => navigate({ tab: String(value) })} className="oc">
    <header className="oc__bar">
      <div className="oc__brand">
        <span className="oc__mark" aria-hidden="true"><Icon name="lock" size={18} /></span>
        <div><p className="oc__title">Owner console</p><p className="oc-muted">steveoak.com, local only</p></div>
      </div>
      <div className="oc__tools">
        <div className="oc-seg" role="group" aria-label="View">
          {(['tab', 'json'] as const).map(option => <button key={option} type="button" className="oc-seg__option" aria-pressed={view === option}
            onClick={() => navigate({ view: option })}><Icon name={option === 'tab' ? 'view' : 'code'} size={16} />{option === 'tab' ? 'Tab' : 'JSON'}</button>)}
        </div>
        <Button variant="ghost" size="icon" aria-label="Refresh every read" title="Refresh every read" onClick={() => { live?.reload(); load(Object.keys(consoleReads) as ReadName[]); }}><Icon name="retry" size={18} /></Button>
        <a className="oc__back" href="/" aria-label="Back to site"><Icon name="arrowUpRight" size={16} /><span className="oc__back-label">Back to site</span></a>
      </div>
      <Tabs.List className="oc-tabs" aria-label="Console sections" activateOnFocus>
        {consoleTabs.map(candidate => <Tabs.Tab key={candidate.id} value={candidate.id} className="oc-tabs__tab" data-stale={isStale(candidate, reads) || undefined}
          title={isStale(candidate, reads) ? `${candidate.label}, stale` : undefined}>
          <Icon name={candidate.icon} size={16} />{candidate.label}
        </Tabs.Tab>)}
        <Tabs.Indicator className="oc-tabs__indicator" />
      </Tabs.List>
    </header>
    <Tabs.Panel value={tab.id} className="oc__main" render={<div />}>
      <div className="oc__head">
        <h1 id="oc-heading" className="oc__heading">{tab.label}</h1>
        {fixture && !tab.live ? <span className="oc-chip" data-tone="watch"><Icon name="testTube" size={14} />Fixture data, not live</span> : null}
      </div>
      {shown.kind === 'signed-out' ? <SignedOut reason={shown.reason} retry={retry} />
        : shown.kind === 'unreachable' ? <Unreachable retry={retry} />
        : shown.kind === 'loading' ? <p className="oc-muted" role="status">Loading the owner reads.</p>
        : <>
          {shown.staleAt !== null ? <StaleBar at={shown.staleAt} retry={retry} /> : null}
          {view === 'json' ? <JsonView model={tab.model(reads)} label={tab.label} /> : <tab.View model={tab.model(reads)} />}
        </>}
    </Tabs.Panel>
  </Tabs.Root>;
}
