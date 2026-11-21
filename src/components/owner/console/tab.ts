import type { ComponentType } from 'react';
import type { IconName } from '@/components/ui/Icon';
import type { Read, ReadName, Reads } from './reads.ts';

/** One console tab. `model` is what the tab draws and what `?view=json` prints, so the two never drift. */
export type ConsoleTab<M = unknown> = {
  id: string;
  label: string;
  icon: IconName;
  /** Reads that gate the tab: a sign-out or a failure on one of these frames the whole tab. A read that feeds one card is left off and shows its state in that card. */
  reads: readonly ReadName[];
  model: (reads: Reads) => M;
  View: ComponentType<{ model: M }>;
  live?: LiveSource;
};
export type LiveSource = { subscribe: (listener: () => void) => () => void; getSnapshot: () => unknown; getServerSnapshot: () => unknown; load: () => void; reload: () => void };
export const defineTab = <M,>(tab: ConsoleTab<M>) => tab as ConsoleTab<unknown>;

/** A link to another tab that keeps the page's other params, such as `fixture` and `view`. */
export function tabHref(id: string): string {
  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  params.set('tab', id);
  return `?${params}`;
}

/** A read that feeds one card, as that card's model shows it. An unreachable read with an earlier answer keeps showing that answer. */
export type CardRead<T> = 'loading' | 'not-deployed' | 'unreachable' | 'signed-out' | T;
export const cardRead = <T, R>(read: Read<T>, ready: (data: T) => R): CardRead<R> =>
  read.kind === 'ready' ? ready(read.data) : read.kind === 'unreachable' ? (read.last ? ready(read.last.data) : 'unreachable') : read.kind;
