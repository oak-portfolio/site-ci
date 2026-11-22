import { oakPurposeOptions } from "../../packages/oak-agent-contracts/src/auth";
import type { OakAccountIdentity } from "./oakAccountClient";

/*
 * ARCH@25: the one answer to "who is here" for every surface that shows the account (header avatar, account menu, the
 * empty state's greeting, saved chats). Before this, five places each decided signed-in their own way and one of them
 * ignored sign-in-again. Pure: it takes the workspace's account fields and the display identity, and returns what to show.
 */

export type OakAccountStatusInput = {
  kind?: string; phase?: string; purpose?: string | null; configured?: boolean;
} | null | undefined;

export type OakAccountViewInput = {
  status: OakAccountStatusInput;
  /** The account must sign in again before it can be used: shown as a guest mid-way, never as signed in. */
  reauthenticate?: boolean;
  /** The sign-in configuration, when it was read separately from the status. */
  signInConfiguration?: { configured?: boolean } | null;
  identity: OakAccountIdentity | null;
};

export type OakAccountTone = "violet" | "blue" | "leaf" | "pink" | "gold";

export type OakAccountView = {
  /** guest: nobody signed in. returning: an account that must sign in again. member: signed in and usable. */
  state: "guest" | "returning" | "member";
  /** Signed in (member), whether or not the account has finished loading. */
  account: boolean;
  /** Signed in and ready: saved chats work. */
  ready: boolean;
  /** Sign-in can be offered in this deployment. */
  configured: boolean;
  identity: OakAccountIdentity | null;
  firstName: string | null;
  /** The menu's name line. */
  title: string;
  /** The menu's second line: email for a member, what signing in gives for a guest. */
  subtitle: string;
  /** What the visitor said they came for, as a label ("Hiring or recruiting"), when they told us. */
  purposeLabel: string | null;
  initials: string;
  tone: OakAccountTone;
};

/** Up to two letters: first and last name, else the email's first letter. */
export function oakAccountInitials(identity: OakAccountIdentity | null) {
  const words = (identity?.name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0].charAt(0) + words[words.length - 1].charAt(0) : words[0]?.charAt(0) ?? identity?.email?.charAt(0) ?? "";
  return letters.toUpperCase();
}

const tones: readonly OakAccountTone[] = ["violet", "blue", "leaf", "pink", "gold"];
/** A steady tint per person (Linear and Slack tint initials the same way), so the same visitor always gets the same disc. */
export function oakAccountTone(seed: string): OakAccountTone {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return tones[hash % tones.length]!;
}

export function oakAccountView({ status, reauthenticate = false, signInConfiguration, identity }: OakAccountViewInput): OakAccountView {
  const configured = Boolean((signInConfiguration ?? status)?.configured);
  const signedIn = status?.kind === "account";
  const account = signedIn && !reauthenticate;
  const ready = account && status?.phase === "ready";
  const shown = account ? identity : null;
  const purposeLabel = account && status?.purpose ? oakPurposeOptions.find(option => option.value === status.purpose)?.label ?? null : null;
  const firstName = shown?.firstName ?? shown?.name?.split(/\s+/)[0] ?? null;
  return {
    state: account ? "member" : signedIn ? "returning" : "guest",
    account, ready, configured, identity: shown, firstName, purposeLabel,
    title: account ? shown?.name ?? shown?.email ?? "Signed in" : "Guest",
    subtitle: account ? shown?.name && shown.email ? shown.email : purposeLabel ?? "Your account"
      : configured ? "Sign in to keep chats for 30 days" : "Sign-in is unavailable right now",
    initials: account ? oakAccountInitials(shown) : "",
    tone: oakAccountTone(shown?.email ?? shown?.name ?? "oak"),
  };
}
