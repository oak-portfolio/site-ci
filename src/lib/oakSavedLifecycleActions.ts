import { getOakAccountContext } from './oakAccountClient';
import { deleteOakSavedConversation, exportOakSavedConversation, readOakSavedConversation } from './oakSavedHistoryClient';
import { clearOakConversationHandoff } from './oakAuthHandoff';
import { removeOakSavedCopies } from './oakSavedLifecycleCopies';
import type { OakWorkspaceState } from './oakWorkspace';
import { showOakToast } from './oakToasts';
import type { SavedConversationSummary } from '../../packages/oak-agent-contracts/src/saved-conversations';

export type OakHistoryLifecycle = Readonly<{ target: SavedConversationSummary | null; operationId: string | null;
  phase: 'idle' | 'confirming' | 'deleting' | 'unconfirmed' | 'conflict' | 'exporting'; notice: string | null }>;
export const idleOakHistoryLifecycle: OakHistoryLifecycle = { target: null, operationId: null, phase: 'idle', notice: null };
export type OakLifecycleOwner = { read: () => OakWorkspaceState; update: (next: Partial<OakWorkspaceState>) => void;
  ready: () => boolean; stopActive: (conversationId: string) => void; invalidate: () => void; subscribe: (callback: () => void) => () => void };
const summary = (record: Awaited<ReturnType<typeof readOakSavedConversation>>): SavedConversationSummary => {
  const { messages, interruptedTurns: _markers, ...rest } = record; return { ...rest, messageCount: messages.length };
};
/** Operation metadata/controllers only. The injected canonical store owns every content copy. */
export function createOakSavedLifecycle(owner: OakLifecycleOwner) {
  let generation = 0, request: AbortController | null = null, channel: BroadcastChannel | null = null;
  const lifecycle = (next: OakHistoryLifecycle) => owner.update({ historyLifecycle: next });
  const busy = () => { const s = owner.read(); return s.pending || s.savePending || s.historyPending || s.authPending || ['deleting', 'exporting'].includes(s.historyLifecycle.phase); };
  const cancel = () => { generation++; request?.abort(); request = null; };
  const invalidate = (id: string, notice: string, broadcast = false) => {
    cancel(); owner.stopActive(id); owner.invalidate(); clearOakConversationHandoff(id);
    const s = owner.read(), record = s.savedRecord?.conversationId === id ? s.savedRecord : null;
    owner.update({ ...removeOakSavedCopies(s, id, record), historyLifecycle: { ...idleOakHistoryLifecycle, notice } });
    if (broadcast) channel?.postMessage({ version: 1, conversationId: id });
  };
  const checkExpiry = () => {
    const s = owner.read(), now = Date.now();
    const ids = new Set(s.savedConversations.filter(item => item.expiresAt <= now).map(item => item.conversationId));
    if (s.savedRecord && s.savedRecord.expiresAt <= now) ids.add(s.savedRecord.conversationId);
    for (const id of ids) invalidate(id, 'The saved expiry date has passed on this device. Refresh history to check availability.');
  };
  const beginDelete = (target: SavedConversationSummary) => {
    checkExpiry(); if (!owner.ready() || busy()) return;
    cancel(); lifecycle({ target, operationId: crypto.randomUUID(), phase: 'confirming', notice: null });
  };
  const confirmDelete = async () => {
    const s = owner.read(), intent = s.historyLifecycle;
    if (!intent.target || !intent.operationId || !['confirming', 'unconfirmed'].includes(intent.phase) || !owner.ready() || busy()) return;
    cancel(); owner.invalidate();
    const version = generation, epoch = getOakAccountContext().epoch, conversationId = s.conversationId;
    const controller = new AbortController(); request = controller;
    const current = () => version === generation && epoch === getOakAccountContext().epoch && conversationId === owner.read().conversationId;
    lifecycle({ ...intent, phase: 'deleting', notice: null });
    if (intent.target.conversationId === s.conversationId) owner.update({ saveError: 'Deletion is not yet confirmed. Automatic saving is paused.' });
    try {
      await deleteOakSavedConversation({ intent: 'explicit-delete', conversationId: intent.target.conversationId,
        expectedVersion: intent.target.version, operationId: intent.operationId }, controller.signal);
      if (current()) { invalidate(intent.target.conversationId, 'Saved application history deleted. Independent copies have separate lifetimes.', true); showOakToast('deleted'); }
    } catch (error) {
      if (!current()) return;
      if (error instanceof Error && error.message === 'conflict') {
        lifecycle({ ...intent, phase: 'conflict', notice: 'Saved history changed. Review the current version before confirming deletion again.' });
      } else lifecycle({ ...intent, phase: 'unconfirmed', notice: 'Deletion could not be confirmed. Your text is still here. Retry this deletion explicitly.' });
    } finally { if (request === controller) request = null; }
  };
  const reviewConflict = async () => {
    const intent = owner.read().historyLifecycle;
    if (!intent.target || intent.phase !== 'conflict' || !owner.ready() || busy()) return;
    cancel(); const version = generation, epoch = getOakAccountContext().epoch, conversationId = owner.read().conversationId;
    const current = () => generation === version && epoch === getOakAccountContext().epoch && conversationId === owner.read().conversationId;
    const controller = new AbortController(); request = controller;
    try {
      const record = await readOakSavedConversation(intent.target.conversationId, controller.signal);
      if (!current()) return;
      // Review owns the fresh deletion prefix, even when an earlier append acknowledgement was lost.
      if (conversationId === record.conversationId) owner.update({ savedRecord: record, savedTranscriptAccountVersion: getOakAccountContext().accountVersion });
      lifecycle({ target: summary(record), operationId: crypto.randomUUID(), phase: 'confirming', notice: 'Review this updated saved version, then choose whether to delete it.' });
    } catch (error) {
      if (!current()) return;
      if (error instanceof Error && error.message === 'missing') invalidate(intent.target.conversationId, 'That saved conversation is unavailable or expired.');
      else lifecycle({ ...intent, notice: 'The current saved version could not load. Deletion remains unconfirmed.' });
    } finally { if (request === controller) request = null; }
  };
  const exportConversation = async (id: string) => {
    checkExpiry(); if (!owner.ready() || busy() || owner.read().historyLifecycle.phase !== 'idle') return;
    cancel(); const version = generation, epoch = getOakAccountContext().epoch, conversationId = owner.read().conversationId;
    const controller = new AbortController(); request = controller;
    const current = () => generation === version && epoch === getOakAccountContext().epoch && conversationId === owner.read().conversationId;
    lifecycle({ ...idleOakHistoryLifecycle, phase: 'exporting' });
    let url: string | null = null;
    try {
      const record = await exportOakSavedConversation(id, controller.signal);
      if (!current()) return;
      url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `oak-conversation-${id}.json`;
      document.body.append(link); try { if (current()) link.click(); } finally { link.remove(); }
      if (current()) { lifecycle({ ...idleOakHistoryLifecycle, notice: 'Download offered. Unsent drafts and replies not yet saved are excluded.' }); showOakToast('exported'); }
    } catch (error) {
      if (!current()) return;
      if (error instanceof Error && error.message === 'missing') invalidate(id, 'That saved conversation is unavailable or expired.');
      else lifecycle({ ...idleOakHistoryLifecycle, notice: 'Export could not be prepared. Your conversation is still here.' });
    } finally { if (url) URL.revokeObjectURL(url); if (request === controller) request = null; }
  };
  const reset = () => { cancel(); };
  const install = () => {
    if (typeof window === 'undefined') return () => {};
    let timer: number | undefined;
    const schedule = () => { clearTimeout(timer); const s = owner.read(); const dates = [s.savedRecord?.expiresAt, ...s.savedConversations.map(item => item.expiresAt)]
      .filter((value): value is number => value !== undefined);
      if (dates.length && typeof window.setTimeout === 'function') timer = window.setTimeout(() => { checkExpiry(); schedule(); }, Math.min(60_000, Math.max(1, Math.min(...dates) - Date.now()))); };
    const stop = owner.subscribe(schedule), focus = () => { checkExpiry(); schedule(); };
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus);
    if (typeof window.BroadcastChannel !== 'undefined') { channel = new window.BroadcastChannel('oak.saved-history.lifecycle.v1');
      channel.onmessage = event => { const v = event.data; if (v && v.version === 1 && typeof v.conversationId === 'string' && /^[a-f0-9-]{36}$/i.test(v.conversationId)) {
        const s = owner.read(); if (s.savedRecord?.conversationId === v.conversationId ||
          (s.conversationId === v.conversationId && s.savedSubmittedMessageIds.length > 0) || s.savedConversations.some(item => item.conversationId === v.conversationId))
          invalidate(v.conversationId, 'Saved history changed in another tab. Refresh to check availability.'); } }; }
    schedule();
    return () => { reset(); clearTimeout(timer); stop(); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); channel?.close(); channel = null; };
  };
  return { beginDelete, confirmDelete, reviewConflict, exportConversation, invalidate, checkExpiry, reset, install,
    dismiss: () => { cancel(); lifecycle({ ...idleOakHistoryLifecycle }); } };
}
