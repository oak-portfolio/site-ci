import { clock } from '../format.ts';
import type { IconName } from '@/components/ui/Icon';
import { digest, formatBytes, parseCredentials, parsePages, parseProfile, parseRobots, parseSkill, routesFrom, type Digest } from './parse.ts';
import { resourceSources, type ResourcePath } from './sources.ts';
import type { Entry, Failure, Ready, Snapshot } from './store.ts';

export type Part<T> =
  | { state: 'loading' }
  | { state: 'failed'; reason: Failure | 'parse'; status: number | null }
  | { state: 'ready'; stale: boolean; data: T };

export type FileRow = Omit<Digest, 'lines' | 'headings'> & {
  path: ResourcePath; label: string; format: string; icon: IconName; purpose: string;
  state: 'loading' | 'ready' | 'failed'; stale: boolean; reason: Failure | null; status: number | null;
  size: string | null; lines: number | null; headings: number | null;
};

const lastOf = (entry: Entry): Ready | null => entry.state === 'ready' ? entry : entry.state === 'idle' ? null : entry.last;

function part<T>(entry: Entry, build: (text: string) => T | null): Part<T> {
  const held = lastOf(entry);
  if (!held) return entry.state === 'failed' ? { state: 'failed', reason: entry.reason, status: entry.status } : { state: 'loading' };
  const data = build(held.text);
  return data === null ? { state: 'failed', reason: 'parse', status: null } : { state: 'ready', stale: entry.state === 'failed', data };
}

const kinds = { '/profile.json': 'json', '/robots.txt': 'robots' } as const;

function fileRow(path: ResourcePath, entry: Entry): FileRow {
  const source = resourceSources.find(candidate => candidate.path === path)!;
  const base = { path, label: source.label, format: source.format, icon: source.icon, purpose: source.purpose, stale: entry.state === 'failed' && lastOf(entry) !== null };
  const held = lastOf(entry);
  if (!held) return { ...base, state: entry.state === 'failed' ? 'failed' : 'loading', reason: entry.state === 'failed' ? entry.reason : null, status: entry.state === 'failed' ? entry.status : null,
    size: null, lines: null, headings: null, topics: [], preview: [] };
  const found = digest(held.text, kinds[path as keyof typeof kinds] ?? 'text');
  return { ...base, state: 'ready', reason: null, status: null, size: formatBytes(held.bytes), ...found };
}

export function buildModel(snapshot: Snapshot) {
  const textOf = (path: ResourcePath) => lastOf(snapshot[path])?.text ?? null;
  const times = resourceSources.flatMap(source => lastOf(snapshot[source.path])?.at ?? []);
  return {
    checked: times.length ? clock(Math.max(...times)) : null,
    files: resourceSources.map(source => fileRow(source.path, snapshot[source.path])),
    profile: part(snapshot['/profile.json'], parseProfile),
    skill: part(snapshot['/skill.md'], parseSkill),
    robots: part(snapshot['/robots.txt'], parseRobots),
    pages: part(snapshot['/llms-full.txt'], text => parsePages(text, routesFrom(textOf('/llms.txt')))),
    credentials: part(snapshot['/llms-full.txt'], parseCredentials),
  };
}
export type ResourcesModel = ReturnType<typeof buildModel>;
