import type { OakWorkspaceState } from './oakWorkspace';
import type { SaveConversationRequest, SavedConversationRecord } from '../../packages/oak-agent-contracts/src/saved-conversations';

/** IDs only, bound to the canonical conversation and validated save/append projections. */
export function submittedOakHistoryIds(state: OakWorkspaceState, submitted: Pick<SaveConversationRequest, 'messages' | 'interruptedTurns'>): string[] {
  return [...new Set([...state.savedSubmittedMessageIds, ...submitted.messages.map(message => message.id),
    ...(submitted.interruptedTurns ?? []).map(turn => turn.requestId)])];
}

/** Clear controlled saved copies, preserving genuinely unsaved later pairs and typed inputs. */
export function removeOakSavedCopies(state: OakWorkspaceState, conversationId: string, record: SavedConversationRecord | null): Partial<OakWorkspaceState> {
  const active = state.conversationId === conversationId;
  const savedIds = new Set(record?.messages.map(message => message.id) ?? []);
  for (const turn of record?.interruptedTurns ?? []) savedIds.add(turn.requestId);
  if (active) for (const id of state.savedSubmittedMessageIds ?? []) savedIds.add(id);
  // A submitted-ID boundary also identifies the ambiguous prefix when the initial Save acknowledgement is lost.
  const knownBoundary = record !== null || (state.savedSubmittedMessageIds?.length ?? 0) > 0;
  const remaining = active ? state.messages.filter(message => knownBoundary && !savedIds.has(message.id)) : state.messages;
  const completed = new Set(remaining.filter(message => message.role === 'assistant' && message.state === 'complete').map(message => message.id));
  const messages = remaining.filter(message => message.role === 'assistant' ? completed.has(message.id) : completed.has(message.id.slice(0, -5)));
  return { savedConversations: state.savedConversations.filter(item => item.conversationId !== conversationId),
    historyCursor: null, historyLoaded: false, historyPageCount: 0,
    ...(state.savedRecord?.conversationId === conversationId ? { savedRecord: null, savedTranscriptAccountVersion: null, savePending: false, saveError: null } : {}),
    ...(active ? { savedSubmittedMessageIds: [], conversationId: messages.length ? crypto.randomUUID() : null, messages, historyRestored: false,
      historyRevision: state.historyRevision + 1, error: null, progress: '', activity: null,
      // Edited brief prose can retain derived content. Preserve its independent fields only.
      briefDraft: state.briefDraft ? { ...state.briefDraft, references: [], text: '', needsFormat: true } : null, briefError: null,
      authOpen: false, authPending: false } : {}) };
}
