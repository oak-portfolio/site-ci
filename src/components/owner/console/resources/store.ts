import { resourceSources, type ResourcePath } from './sources.ts';

export { resourceSources, sourceOf, type ResourcePath } from './sources.ts';

export type Ready = { state: 'ready'; text: string; bytes: number; at: number };
export type Failure = 'network' | 'status' | 'type';
export type Entry =
  | { state: 'idle' }
  | { state: 'loading'; last: Ready | null }
  | Ready
  | { state: 'failed'; reason: Failure; status: number | null; last: Ready | null; at: number };
export type Snapshot = Record<ResourcePath, Entry>;
type Fetcher = (input: string, init: RequestInit) => Promise<Pick<Response, 'status' | 'headers' | 'text'>>;

const idle = (): Snapshot => Object.fromEntries(resourceSources.map(source => [source.path, { state: 'idle' }])) as Snapshot;
const lastOf = (entry: Entry): Ready | null => entry.state === 'ready' ? entry : entry.state === 'idle' ? null : entry.last;

export function createResourceStore(fetcher: Fetcher = (input, init) => fetch(input, init)) {
  const empty = idle();
  let snapshot = empty;
  const listeners = new Set<() => void>();
  const put = (path: ResourcePath, entry: Entry) => { snapshot = { ...snapshot, [path]: entry }; listeners.forEach(listener => listener()); };

  async function read(source: (typeof resourceSources)[number]) {
    const last = lastOf(snapshot[source.path]);
    put(source.path, { state: 'loading', last });
    const failed = (reason: Failure, status: number | null) => put(source.path, { state: 'failed', reason, status, last, at: Date.now() });
    try {
      const response = await fetcher(source.path, { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(60_000) });
      if (response.status !== 200) return failed('status', response.status);
      if (!response.headers.get('content-type')?.toLowerCase().startsWith(source.type)) return failed('type', response.status);
      const text = await response.text();
      put(source.path, { state: 'ready', text, bytes: new TextEncoder().encode(text).length, at: Date.now() });
    } catch {
      failed('network', null);
    }
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => empty,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load: () => { for (const source of resourceSources) if (snapshot[source.path].state === 'idle') void read(source); },
    reload: () => { for (const source of resourceSources) if (snapshot[source.path].state !== 'loading') void read(source); },
  };
}

export const resourceStore = createResourceStore();
