import type { OakTask, OwnerContactTopic } from './types.ts';

export const ownerContactTopics = Object.freeze([
  'steve-pricing', 'steve-rates', 'steve-compensation', 'steve-availability', 'steve-start-date',
] satisfies OwnerContactTopic[]);

export type TaskBoundary =
  | Readonly<{ kind: 'declined'; retrieval: false }>
  | Readonly<{ kind: 'contact'; retrieval: false; control: 'Say Hi' }>
  | Readonly<{ kind: 'public-question'; retrieval: true }>;

export function resolveTaskBoundary(task: OakTask): TaskBoundary {
  switch (task.kind) {
    case 'decline':
      return { kind: 'declined', retrieval: false };
    case 'contact':
      return { kind: 'contact', retrieval: false, control: 'Say Hi' };
    case 'correction':
    case 'question':
    case 'advice':
    case 'role-fit':
      return { kind: 'public-question', retrieval: true };
  }
}
