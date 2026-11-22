import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/Icon';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { oakMeaningIcons } from '@/lib/oakMeaningIcons';
import { OakSprite } from './OakActivitySprite';
import { beginOakSavedDeletion, confirmOakSavedDeletion, dismissOakSavedDeletion, exportOakSavedHistory, reviewOakSavedDeletion,
  type OakWorkspaceState } from '@/lib/oakWorkspace';
import type { SavedConversationSummary } from '../../../packages/oak-agent-contracts/src/saved-conversations';

export const savedCopyLifetimes = 'Deleting saved history removes the application copy. Downloaded exports, backups, provider records, diagnostic traces and separately permitted evaluation copies have their own lifetimes. Deletion does not promise immediate erasure of those copies.';

const dayMs = 86_400_000;
/** Whole calendar days between two times, in the visitor's own time zone. */
const daysBetween = (timestamp: number, now: number) => {
  const start = (value: number) => { const date = new Date(value); date.setHours(0, 0, 0, 0); return date.getTime(); };
  return Math.round((start(now) - start(timestamp)) / dayMs);
};

/** Q12: the inset groups a saved list falls into, newest first (Notion and ChatGPT history). */
export const savedGroupLabels = ['Today', 'Yesterday', 'Previous 7 days', 'Older'] as const;
export type SavedGroupLabel = (typeof savedGroupLabels)[number];

export function savedGroup(timestamp: number, now = Date.now()): SavedGroupLabel {
  const days = daysBetween(timestamp, now);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? 'Previous 7 days' : 'Older';
}

/** Splits saved rows into their groups in label order, keeping each group's row order and dropping empty groups. */
export function groupSavedConversations<T extends { createdAt: number }>(items: readonly T[], now = Date.now()) {
  return savedGroupLabels.map(label => ({ label, items: items.filter(item => savedGroup(item.createdAt, now) === label) }))
    .filter(group => group.items.length > 0);
}

/** "Today, 9:40 AM", "Yesterday, 9:40 AM", "Monday, 9:40 AM" within the week, or "Oct 8, 9:40 AM". */
export function savedWhen(timestamp: number, now = Date.now()) {
  const time = new Date(timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const days = daysBetween(timestamp, now);
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  if (days < 7) return `${new Date(timestamp).toLocaleDateString(undefined, { weekday: 'long' })}, ${time}`;
  return new Date(timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Export and delete for one saved conversation live in one row menu (D116, Granola): the row itself opens. Delete hands focus
 * to its confirmation dialog, so the menu does not pull it back to the trigger.
 */
export function OakSavedConversationActions({ item, disabled, container }: { item: SavedConversationSummary; disabled: boolean; container?: HTMLElement | null }) {
  const trigger = useRef<HTMLButtonElement | null>(null), deleting = useRef(false);
  // The workspace dialog reclaims focus when a nested menu closes, so hand it back to this row's trigger (as OakWorkspace does for its menus).
  return <Menu modal={false} onOpenChange={open => {
    if (open) deleting.current = false;
    else if (!deleting.current) requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  }}>
    <Tooltip>
      <TooltipTrigger render={<MenuTrigger ref={trigger} disabled={disabled} aria-label="Conversation actions" render={<Button type="button" variant="ghost" size="icon" />} />}>
        <Icon name={oakMeaningIcons['panel.row-actions']} />
      </TooltipTrigger>
      <TooltipContent positionerClassName="oak-composer__tooltip">Conversation actions</TooltipContent>
    </Tooltip>
    <MenuContent container={container ?? undefined} align="end" aria-label="Conversation actions" finalFocus={() => deleting.current ? false : trigger.current}>
      {/* Review v4: the row keeps only its title and count; when the copy expires is read here, above the actions. */}
      <p className="oak-saved__menu-note"><Icon name="clock" size={14} />Kept until {new Date(item.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
      <MenuItem nativeButton render={<button type="button" />} onClick={() => { void exportOakSavedHistory(item.conversationId); }}><Icon name="download" />Export JSON</MenuItem>
      <MenuItem nativeButton render={<button type="button" />} className="oak-saved__menu-delete" onClick={() => { deleting.current = true; beginOakSavedDeletion(item); }}><Icon name="delete" />Delete saved conversation</MenuItem>
    </MenuContent>
  </Menu>;
}

/** Versioned delete confirmation in `ui/dialog`, kept inside the workspace so the outer modal keeps focus ownership. */
export function OakSavedDeletionConfirmation({ state, container }: { state: OakWorkspaceState; container?: HTMLElement | null }) {
  const value = state.historyLifecycle;
  const open = Boolean(value.target) && value.phase !== 'idle' && value.phase !== 'exporting';
  const pending = value.phase === 'deleting', keep = useRef<HTMLElement>(null);
  return <Dialog open={open} onOpenChange={next => { if (!next && !pending) dismissOakSavedDeletion(); }}>
    <DialogContent open={open} container={container ?? undefined} initialFocus={keep} aria-busy={pending}>
      {value.target ? <>
        <div className="oak-saved-delete__art"><span className="oak-art-tile" aria-hidden="true"><OakSprite pose="delete-review" size="medium" /></span></div>
        <DialogTitle>Delete this saved conversation?</DialogTitle>
        <DialogDescription>
          {savedWhen(value.target.createdAt)}, {value.target.messageCount} messages, saved version {value.target.version}. Unsent drafts stay here.
        </DialogDescription>
        {value.notice ? <p className="oak-saved-delete__notice" role="status">{value.notice}</p> : null}
        <details className="oak-saved__terms">
          <summary>What deletion removes</summary>
          <p>Saved replies and their related app copies will be removed. {savedCopyLifetimes}</p>
        </details>
        <DialogFooter>
          <Button ref={keep} type="button" variant="ghost" size="sm" disabled={pending} onClick={dismissOakSavedDeletion}>Keep</Button>
          {value.phase === 'conflict' ? <Button type="button" variant="secondary" size="sm" onClick={() => { void reviewOakSavedDeletion(); }}>Review saved version</Button> :
            <Button type="button" size="sm" disabled={pending} onClick={() => { void confirmOakSavedDeletion(); }}>
              <Icon name="delete" />{pending ? 'Deleting…' : value.phase === 'unconfirmed' ? 'Retry deletion' : 'Delete'}</Button>}
        </DialogFooter>
      </> : null}
    </DialogContent>
  </Dialog>;
}
