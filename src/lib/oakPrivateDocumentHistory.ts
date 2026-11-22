import type { OakAnswer } from '../../packages/oak-agent-contracts/src/types';

type TranscriptMessage = { id: string; role: 'user' | 'assistant'; answer: OakAnswer | null; privateDocumentTurn?: true };

/** Request ids of private document turns: selected document text, a document answer, or a document role fit. */
export function privateDocumentRequestIds(messages: readonly TranscriptMessage[]): Set<string> {
  return new Set(messages.filter(message => message.privateDocumentTurn || message.answer?.kind === 'document' ||
    (message.answer?.kind === 'role-fit' && message.answer.coverage))
    .map(message => message.role === 'user' ? message.id.slice(0, -5) : message.id));
}

/** Preserve complete public pairs while keeping prior private document turns in memory only. */
export function withoutPrivateDocumentTurns<T extends TranscriptMessage>(messages: readonly T[]): T[] {
  const privateRequests = privateDocumentRequestIds(messages);
  return messages.filter(message => !privateRequests.has(message.role === 'user' ? message.id.slice(0, -5) : message.id));
}
