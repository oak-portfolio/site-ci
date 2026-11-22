import * as React from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Icon } from "@/components/ui/Icon";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { OakSprite } from "./OakActivitySprite";
import { oakMeaningIcons } from "@/lib/oakMeaningIcons";
import { OakSavedConversationActions, OakSavedDeletionConfirmation, groupSavedConversations, savedCopyLifetimes, savedWhen } from "./OakSavedLifecycleControls";
import { beginOakSignIn, retryOakHistorySave, loadOakSavedConversations, closeOakSavedConversations,
  openOakSavedConversation, type OakWorkspaceState } from "@/lib/oakWorkspace";
import { oakAccountView } from "@/lib/oakAccountView";

const shortDate = (timestamp: number) => new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function OakSavedConversations({ state }: { state: OakWorkspaceState }) {
  const [host, setHost] = React.useState<HTMLElement | null>(null);
  const anchor = React.useCallback((element: HTMLElement | null) => setHost(element?.closest<HTMLElement>(".oak-workspace") ?? null), []);
  const configured = Boolean(state.authStatus?.configured);
  // ARCH@25: the same signed-in rule as the header and the greeting.
  const { account, ready } = oakAccountView({ status: state.authStatus, reauthenticate: state.authReauthenticate, identity: null });
  const busy = state.pending || state.savePending || state.historyPending || state.authPending || state.historyLifecycle.phase !== "idle";
  const activeSaved = state.savedRecord ? { ...state.savedRecord, messageCount: state.savedRecord.messages.length } : null;
  const completed = state.messages.some(message => message.role === "assistant" && message.state === "complete");
  const saved = Boolean(state.savedRecord && !state.saveError);
  const canSave = configured && ready && !busy && Boolean(state.conversationId) && state.messages.length > 0;
  // Q12-G2: an empty list offers Save itself, so the current row drops its own Save rather than show two.
  const emptyList = state.historyOpen && state.historyLoaded && !state.historyPending && !state.historyError && !state.savedConversations.length;
  const groups = groupSavedConversations(state.savedConversations);
  const status = state.saveError ?? (!configured ? "Account saving is being prepared. This conversation stays in this tab." : !account ?
    "Sign in, then choose Save. Sign-in alone does not save this conversation." : !ready ? "Continue with your account, then choose Save." : state.savedRecord ?
      `Saved until ${shortDate(state.savedRecord.expiresAt)}. New completed replies save automatically.` :
      completed ? "Not saved yet. Unsent drafts stay in this tab." : "Save after an answer completes. Unsent drafts stay in this tab.");
  return <section ref={anchor} className="oak-saved" aria-label="Save and reopen conversations">
    <div className="oak-saved__row oak-saved__row--current">
      <span className="oak-saved__chip" data-saved={saved || undefined} data-oak-tile={saved ? "saved" : "unsaved"} aria-hidden="true"><Icon name={saved ? "checkmark" : "history"} /></span>
      <div className="oak-saved__text">
        <p className="oak-saved__title">This conversation</p>
        <p className="oak-saved__meta" role="status">{status}</p>
      </div>
      <div className="oak-saved__actions">
        {configured && !ready ? <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={beginOakSignIn}>
          {state.authReauthenticate ? "Sign in again" : account ? "Continue with your account" : "Sign in to save"}
        </Button> : saved && activeSaved ? state.historyOpen ? null : <OakSavedConversationActions item={activeSaved} disabled={busy} container={host} /> :
          emptyList ? null : <Button type="button" size="sm" disabled={!canSave}
            onClick={retryOakHistorySave}>{state.savePending ? "Saving…" : "Save"}</Button>}
      </div>
    </div>
    {state.historyLifecycle.notice && state.historyLifecycle.phase === "idle" ? <Callout icon="checkmark" role="status">{state.historyLifecycle.notice}</Callout> : null}
    <Button type="button" variant="ghost" size="sm" className="oak-saved__toggle" disabled={!configured || !ready || busy}
      aria-expanded={state.historyOpen} aria-controls="oak-saved-conversations"
      onClick={() => { if (state.historyOpen) closeOakSavedConversations(); else void loadOakSavedConversations(); }}>
      <Icon name={oakMeaningIcons["panel.saved"]} /><span>Saved conversations</span>
      {state.historyLoaded ? <span className="oak-saved__count">{state.savedConversations.length}{state.historyCursor ? "+" : ""}</span> : null}
      <Icon name="arrowDown" />
    </Button>
    {state.historyOpen ? <div id="oak-saved-conversations" className="oak-saved__panel" aria-busy={state.historyPending}>
      {/* The panel's picture shows the hourglass; the rows below hold the list's shape while it loads. */}
      {state.historyPending ? <p className="sr-only" role="status">Loading saved history…</p> : null}
      {state.historyError ? <Callout variant="destructive" icon="alert" role="status">
        <p>{state.historyError}</p>
        {!state.historyPending ? <Button type="button" variant="secondary" size="sm" onClick={() => { void loadOakSavedConversations(); }}>Try loading again</Button> : null}
      </Callout> : null}
      {/* Q12-G2: nothing saved yet says what saving does and offers Save; the gold clock is the keep-for-30-days tile (D72). */}
      {emptyList ? <div className="oak-saved__none"><Empty>
        <EmptyHeader>
          <EmptyMedia><span className="oak-saved__chip oak-saved__chip--keep" data-oak-tile="keep" aria-hidden="true"><Icon name="clock" /></span></EmptyMedia>
          <EmptyTitle>No saved conversations yet</EmptyTitle>
          <EmptyDescription>Saving keeps a conversation for 30 days, so you can reopen it here on any device you sign in on.</EmptyDescription>
        </EmptyHeader>
        {!saved ? <EmptyContent>
          <Button type="button" size="sm" disabled={!canSave} onClick={retryOakHistorySave}>
            <Icon name="checkmark" />{state.savePending ? "Saving…" : "Save this conversation"}</Button>
        </EmptyContent> : null}
      </Empty></div> : null}
      {/* Q12-G2: loading keeps the list's shape: a group header and three rows in the same inset group the list uses. */}
      {state.historyPending && !state.savedConversations.length ? <div className="oak-saved__group" data-loading="" aria-hidden="true">
        <span className="oak-saved__group-header oak-saved__group-header--skeleton"><Skeleton /></span>
        <div className="oak-saved__inset">
          {[0, 1, 2].map(index => <div key={index} className="oak-saved__row oak-saved__row--skeleton" aria-hidden="true">
            <span className="oak-saved__text"><Skeleton /><Skeleton /></span>
          </div>)}
        </div>
      </div> : null}
      {/* Q12-G1 (Notion, Granola): rows sit in inset groups under Today, Yesterday, Previous 7 days and Older. The row is the */}
      {/* Open action, and export, delete and the keep-until date share the one row menu (D116, review v4). */}
      {groups.map(group => <section key={group.label} className="oak-saved__group" aria-labelledby={`oak-saved-group-${group.label.replace(/\W+/g, "-").toLowerCase()}`}>
        <h3 id={`oak-saved-group-${group.label.replace(/\W+/g, "-").toLowerCase()}`} className="oak-saved__group-header">{group.label}</h3>
        <div className="oak-saved__inset"><ItemGroup>
        {group.items.map(item => <Item key={item.conversationId} role="listitem" className="oak-saved__row" data-disabled={busy || undefined}>
          <ItemContent>
            <ItemTitle>
              {/* Q16-D10: the first question names the row; the date moves to the metadata line. Older rows without one keep the date. */}
              <button type="button" className="oak-saved__open" disabled={busy}
                aria-label={`Open conversation from ${savedWhen(item.createdAt)}${item.title ? `: ${item.title}` : ""}`}
                onClick={() => { void openOakSavedConversation(item.conversationId); }}>
                {item.title ? <span className="oak-saved__name">{item.title}</span>
                  : <time dateTime={new Date(item.createdAt).toISOString()}>{savedWhen(item.createdAt)}</time>}
              </button>
            </ItemTitle>
            {/* Review v4 (Grok, WHOOP): the group header already names the day, so a row is its title and one short muted line. */}
            <ItemDescription>{item.title ? <><time dateTime={new Date(item.createdAt).toISOString()}>{savedWhen(item.createdAt)}</time> · </> : null}{item.messageCount} messages</ItemDescription>
          </ItemContent>
          <ItemActions><OakSavedConversationActions item={item} disabled={busy} container={host} /></ItemActions>
        </Item>)}
        </ItemGroup></div>
      </section>)}
      {state.historyCursor && state.historyPageCount < 50 ? <Button type="button" variant="ghost" size="sm" disabled={busy}
        onClick={() => { void loadOakSavedConversations(true); }}>More saved conversations</Button> : null}
      {state.historyCursor && state.historyPageCount >= 50 ? <p className="oak-saved__empty">History page limit reached. Reopen the list to refresh it.</p> : null}
    </div> : null}
    <details className="oak-saved__terms">
      <summary><OakSprite pose="keep-calendar" size="badge" />How saving works</summary>
      <p>Open restores saved answers. It does not send another question, and your unsent draft stays here.</p>
      <p>Thirty days after the last newly saved message. Opening or exporting does not extend expiry.</p>
      <p>{savedCopyLifetimes}</p>
    </details>
    <OakSavedDeletionConfirmation state={state} container={host} />
  </section>;
}
