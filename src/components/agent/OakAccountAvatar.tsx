import * as React from "react";
import { Icon } from "@/components/ui/Icon";
import { getOakAccountIdentity, subscribeOakAccountContext, type OakAccountIdentity } from "@/lib/oakAccountClient";
import { oakAccountInitials, oakAccountTone, oakAccountView, type OakAccountView, type OakAccountViewInput } from "@/lib/oakAccountView";

export { oakAccountInitials };

/** R12: the signed-in visitor's display identity, re-read whenever the account SDK reports a change. */
export function useOakAccountIdentity(enabled: boolean): OakAccountIdentity | null {
  const identity = React.useSyncExternalStore(subscribeOakAccountContext, getOakAccountIdentity, () => null);
  return enabled ? identity : null;
}

/** ARCH@25: who is here, for any surface that shows the account. One subscription, one rule (src/lib/oakAccountView.ts). */
export function useOakAccount(input: Omit<OakAccountViewInput, "identity">): OakAccountView {
  const identity = useOakAccountIdentity(input.status?.kind === "account" && !input.reauthenticate);
  return oakAccountView({ ...input, identity });
}

/**
 * R12 (Oak, review v9): one avatar wherever the account shows. Signed in, it is the visitor's own photo from their sign-in
 * provider, as every OAuth app does, and their initials on a tinted disc when there is no photo or it fails to load.
 * Signed out, it is a neutral person on a quiet disc.
 *
 * R13 (Oak, review v10: "add some premium feel decoration for the profile of signed-in users"): a signed-in avatar wears a
 * thin ring in the launcher's violet, pink and gold, the same gradient as "Agent" in the wordmark (Instagram, X and Arc
 * mark a person's own avatar with a ring rather than a label). A guest's disc has none, so the ring itself says signed in.
 */
export function OakAccountAvatar({ identity, signedIn, size = "sm" }: {
  identity: OakAccountIdentity | null;
  signedIn: boolean;
  size?: "xs" | "sm" | "lg";
}) {
  const photo = signedIn ? identity?.imageUrl ?? null : null;
  const [failed, setFailed] = React.useState<string | null>(null);
  const initials = signedIn ? oakAccountInitials(identity) : "";
  const glyph = size === "lg" ? 20 : size === "xs" ? 12 : 16;
  const kind = !signedIn ? "guest" : photo && failed !== photo ? "photo" : initials ? "initials" : "glyph";
  return <span className="oak-avatar" data-size={size} data-kind={kind} data-ring={signedIn ? "" : undefined}
    data-tone={kind === "initials" || kind === "glyph" ? oakAccountTone(identity?.email ?? identity?.name ?? "oak") : undefined} aria-hidden="true">
    {kind === "photo" ? <img src={photo!} alt="" referrerPolicy="no-referrer" decoding="async" draggable={false}
      onError={() => setFailed(photo)} />
      : kind === "initials" ? initials : <Icon name="human" size={glyph} />}
  </span>;
}
