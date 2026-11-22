import * as React from "react";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Menu, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { oakAllowanceSummary } from "@/lib/oakAllowance";
import { beginOakSignIn, openOakSurface, signOutOak, useOakWorkspace } from "@/lib/oakWorkspace";
// R11 review: a fresh guest after sign-out starts with no Turnstile pass, token or challenge carried over.
import { resetOakTurnstileState } from "@/lib/oakTurnstile";
import { OakAccountAvatar, useOakAccount } from "./OakAccountAvatar";

/**
 * R11 (Oak, review v8): one account and settings menu on the header, so everything about the visitor and this browser
 * lives in one familiar place (ChatGPT's and Claude's profile menu, Hootsuite's account panel, Mistral's profile; Mobbin
 * links in evidence/r11-references.md). Who you are sits on top; saved chats and answers come next; privacy and signing
 * in or out close the list.
 *
 * R12 (Oak, review v9; ChatGPT, Claude, Perplexity and Linear in evidence/r12-references.md): the trigger is always an
 * avatar. Signed in, it is the visitor's own photo (initials on a tinted disc without one) and the top row shows photo,
 * name and email. Signed out, it is a neutral person and the top row invites signing in with a pill.
 *
 * R13 (Oak, review v10): "Member" was the wrong word, since there is no membership here. The row now says what signing in
 * actually gives (saved chats for 30 days). A guest's trigger reads Sign in beside the neutral face, where ChatGPT and
 * Claude put it when logged out, instead of a nudge under the starters; it opens this menu with Sign in on top.
 */
export function OakAccountMenu({ container, open, onOpenChange }: {
  container: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const state = useOakWorkspace();
  const trigger = React.useRef<HTMLButtonElement | null>(null);
  const selected = React.useRef(false);
  const identityId = React.useId();
  const status = state.authStatus;
  // ARCH@25: the account view re-renders on every account change, so the identity line follows sign-in and sign-out.
  const view = useOakAccount({ status, reauthenticate: state.authReauthenticate, signInConfiguration: state.authSignInConfiguration });
  const { account, ready, configured, identity, title, subtitle } = view;
  const allowance = oakAllowanceSummary(status);
  const busy = state.authPending;
  const choose = (run: () => void, keepFocus = false) => {
    selected.current = !keepFocus;
    onOpenChange(false);
    run();
  };
  const row = (icon: IconName, label: string, onClick: () => void, extra?: { trailing?: string; disabled?: boolean }) =>
    <MenuItem nativeButton render={<button type="button" />} className="oak-account-menu__item" disabled={extra?.disabled} onClick={onClick}>
      <Icon name={icon} />
      <span className="oak-account-menu__label">{label}</span>
      {extra?.trailing ? <span className="oak-account-menu__trailing">{extra.trailing}</span> : null}
    </MenuItem>;
  // The visible "Sign in" leads the guest's name, so voice control and screen readers hear what they see (WCAG 2.5.3).
  const name = account ? "Account" : configured && !state.authReauthenticate ? "Sign in, account and settings" : "Account and settings, signed out";
  // A guest who has not started signing in gets the invitation on top; one mid-way keeps the row that finishes it.
  const invite = !account && !state.authReauthenticate;
  // A guest who can sign in sees the word on the trigger; one who cannot, or is mid-way, keeps the plain face.
  const guestLabel = invite && configured;
  return <Menu open={open} modal={false} onOpenChange={next => { if (next) selected.current = false; onOpenChange(next); }}>
    <Tooltip>
      <TooltipTrigger render={<MenuTrigger ref={trigger} data-oak-account-trigger data-signed-in={account ? "true" : undefined}
        data-label={guestLabel ? "" : undefined}
        aria-label={name} render={<Button variant="ghost" size={guestLabel ? "sm" : "icon"} />} />}>
        <OakAccountAvatar identity={identity} signedIn={account} />
        {guestLabel ? <span className="oak-account-trigger__label">Sign in</span> : null}
      </TooltipTrigger>
      <TooltipContent>{account ? "Account" : "Account and settings"}</TooltipContent>
    </Tooltip>
    <MenuContent container={container} side="bottom" align="end" aria-label="Account and settings" aria-describedby={identityId}
      finalFocus={() => selected.current ? false : trigger.current}>
      <div className="oak-account-menu__identity" data-guest={account ? undefined : ""}>
        <OakAccountAvatar identity={identity} signedIn={account} size="lg" />
        <span className="oak-account-menu__who" id={identityId}>
          <span className="oak-account-menu__name-row">
            <span className="oak-account-menu__name">{title}</span>
          </span>
          <span className="oak-account-menu__meta" title={account && identity?.email ? identity.email : undefined}>{subtitle}</span>
          {ready ? <span className="oak-account-menu__perk"><Icon name="history" size={12} />Save chats for 30 days</span> : null}
        </span>
      </div>
      {invite ? <MenuItem nativeButton render={<button type="button" />} className="oak-account-menu__signin" disabled={busy || !configured}
        onClick={() => choose(beginOakSignIn)}>
        <Icon name="login" size={16} />{configured ? "Sign in" : "Sign-in unavailable"}
      </MenuItem> : null}
      <MenuSeparator />
      <MenuGroup>
        <MenuGroupLabel>Chats</MenuGroupLabel>
        {row("history", "Saved chats", () => choose(() => openOakSurface("conversation")))}
        {row("key", "Answers and model", () => choose(() => openOakSurface("funding")),
          { trailing: allowance ? `${allowance.remaining} left` : undefined })}
      </MenuGroup>
      <MenuSeparator />
      <MenuGroup>
        <MenuGroupLabel>Account</MenuGroupLabel>
        <MenuItem render={<a className="oak-account-menu__item" href="/privacy" aria-label="Privacy" />}>
          <Icon name="lock" /><span className="oak-account-menu__label">Privacy</span>
        </MenuItem>
        {/* Sign out stays a plain row, as ChatGPT's Log out and Claude's Log out do; it ends this chat like New conversation. */}
        {/* R11 review: sign-out waits for a running answer, so the row says so instead of closing on a click that does nothing. */}
        {ready ? row("login", busy ? "Signing out…" : state.pending ? "Sign out after this answer" : "Sign out", () => choose(() => { void signOutOak().then(done => { if (done) resetOakTurnstileState(); }); }, true), { disabled: busy || state.pending })
          : account || state.authReauthenticate ? row("login", account ? "Finish setting up" : "Sign in again", () => choose(beginOakSignIn), { disabled: busy || !configured })
          : null}
      </MenuGroup>
    </MenuContent>
  </Menu>;
}
