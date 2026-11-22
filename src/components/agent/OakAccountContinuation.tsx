import * as React from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Icon } from "@/components/ui/Icon";
import { Questionnaire, QuestionnaireChoice, QuestionnaireChoices, QuestionnaireDescription, QuestionnaireError, QuestionnaireInput,
  QuestionnaireItem, QuestionnaireNav, QuestionnaireProgress, QuestionnaireSubmit, QuestionnaireTitle } from "@/components/ui/questionnaire";
import { oakPurposeOptions, oakPurposeSchema } from "../../../packages/oak-agent-contracts/src/auth";
import { mountOakSignIn, canRecoverOakGuestSession } from "@/lib/oakAccountClient";
import { beginOakSignIn, closeOakSignIn, completeOakAccount, refreshOakAuthStatus, startFreshOakGuestSession, type OakWorkspaceState } from "@/lib/oakWorkspace";
import { WorkflowPanel, oakHeroTone } from "./WorkflowPanel";
import { OakSprite, type OakActivitySpritePose } from "./OakActivitySprite";

/** Each reason to sign up reads at a glance (D70). */
const purposeIcons = { recruiting: "briefcase", consulting: "puzzle", research: "testTube", exploring: "compass", other: "sparkles" } as const;

/** Q12-G3 (ChatGPT, PlayAI): the sign-in prompt names one concrete benefit. Signing in adds saved chats, never more answers (ADR 0002). */
export const oakSignInBenefit = "Signing in lets you save conversations and reopen them for 30 days on any device.";
/** Said with the benefit, so the visitor knows nothing they have here is lost by signing in. */
export const oakSignInKeeps = "Your conversation and draft stay right here.";

const purposeItems = [
  { name: "purpose", required: true, choices: oakPurposeOptions.map(option => ({ value: option.value })) },
  { name: "company" },
  { name: "referral" },
] as const;

function SignIn({ publishableKey }: { publishableKey: string }) {
  const node = React.useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    if (!node.current) return;
    let closed = false;
    let cleanup: (() => void) | undefined;
    setFailed(false);
    void mountOakSignIn(node.current, publishableKey, () => { if (!closed) void refreshOakAuthStatus(); })
      .then(stop => { if (closed) stop(); else cleanup = stop; })
      .catch(() => { if (!closed) setFailed(true); });
    return () => { closed = true; cleanup?.(); };
  }, [publishableKey]);
  return <>
    <div ref={node} className="oak-account-sign-in" />
    {failed ? <p role="status">Sign-in could not load. Keep your draft and try again when ready.</p> : null}
  </>;
}

export function OakAccountContinuation({ state, onContact }: { state: OakWorkspaceState; onContact?: () => void }) {
  const status = state.authStatus;
  const [purpose, setPurpose] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [referral, setReferral] = React.useState("");
  if (state.pending || (!status && !state.authReauthenticate)) return state.authError ? <p className="oak-workspace__status" role="status">{state.authError}</p> : null;
  const configuration = state.authSignInConfiguration ?? status;
  const publishableKey = configuration?.publishableKey;
  const guestRecovery = state.authReauthenticate && state.authStatus?.kind !== "account" &&
    state.authSignInConfiguration?.guestRecoveryAvailable && canRecoverOakGuestSession();
  if (status?.phase === "guest" && !state.authReauthenticate && !state.authOpen) return null;
  // A ready account needs no banner: the composer's answers-left ring and its hint carry today's and this month's count.
  if (status?.phase === "ready" && !state.authReauthenticate) return null;
  const unavailable = !configuration?.configured && !state.authOpen && !state.authReauthenticate && !guestRecovery;
  const title = unavailable ? "Sign-in is unavailable right now" : guestRecovery ? "Guest session unavailable" : state.authReauthenticate ? "Your session ended" : status?.kind === "guest" ? "Continue with an account" : "Finish setting up your account";
  const pose: OakActivitySpritePose = state.authReauthenticate ? "session-expired" : !configuration?.configured ? "gate-closed"
    : status?.kind === "account" ? "purpose" : "signing-in";
  // A re-sign-in carries its own reason from the store; it replaces the generic line instead of repeating it under the button.
  const reason = state.authReauthenticate && !state.authOpen ? state.authError : null;
  const body = <>
    {!state.authOpen ? <>
      {guestRecovery ? <>
        <p>Start a fresh guest session to continue. This clears the current conversation, draft and document preview, and abandons access to the previous guest session.</p>
        <Button type="button" size="sm" disabled={state.authPending} onClick={() => { void startFreshOakGuestSession(); }}>{state.authPending ? "Starting…" : "Start a fresh guest session"}</Button>
      </> : null}
      {reason ? <p role="status">{reason}</p> : state.authReauthenticate ? <p>Sign in again to continue with your conversation and draft.</p>
        : unavailable ? <p className="oak-account__benefit">{oakSignInKeeps} Saving conversations returns once sign-in is back.</p>
        : status?.kind === "guest" ? <p className="oak-account__benefit">{oakSignInBenefit} {oakSignInKeeps}</p>
        : <p>Choose a purpose to continue this conversation with your account.</p>}
      <div className="oak-account__actions">
        {/* With sign-in off, reaching Steve is the way forward; checking again stays as the quieter second choice. */}
        {!configuration?.configured && onContact ? <Button type="button" size="sm" onClick={onContact}><Icon name="mail" />Contact Steve</Button> : null}
        <Button type="button" size="sm" variant={!configuration?.configured && onContact ? "ghost" : "primary"} disabled={state.authPending}
          onClick={configuration?.configured ? beginOakSignIn : () => { void refreshOakAuthStatus(); }}>
          {!configuration?.configured ? "Check sign-in again" : state.authReauthenticate ? "Sign in again" : status?.kind === "guest" ? "Sign in to continue" : "Continue with your account"}
        </Button>
      </div>
    </> : (status?.kind === "guest" || state.authReauthenticate) && publishableKey ? <>
      <p>Your conversation and draft stay in this browser tab while you sign in. Account history is saved only when you choose Save.</p>
      <SignIn publishableKey={publishableKey} />
    </> : status?.kind === "account" && !state.authReauthenticate ? <Questionnaire items={purposeItems} shortcuts="letters" onSubmit={event => {
      event.preventDefault();
      const selected = oakPurposeSchema.safeParse(purpose);
      if (selected.success) void completeOakAccount({ purpose: selected.data, ...(company.trim() ? { company: company.trim() } : {}), ...(referral.trim() ? { referral: referral.trim() } : {}) });
    }}>
      <QuestionnaireProgress />
      <QuestionnaireItem name="purpose" required disabled={state.authPending}>
        <QuestionnaireTitle>What brings you here?</QuestionnaireTitle>
        <QuestionnaireDescription>Your guest answers carry over to your account; signing in adds saved chats, not answers.</QuestionnaireDescription>
        <QuestionnaireChoices>
          {oakPurposeOptions.map(option => <QuestionnaireChoice key={option.value} value={option.value} checked={purpose === option.value}
            icon={purposeIcons[option.value]} onChange={event => setPurpose(event.target.value)}>{option.label}</QuestionnaireChoice>)}
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireItem name="company" disabled={state.authPending}>
        <QuestionnaireTitle>Company</QuestionnaireTitle>
        <QuestionnaireDescription>Optional. Skip if you prefer not to say.</QuestionnaireDescription>
        <QuestionnaireInput value={company} maxLength={160} aria-label="Company" onChange={event => setCompany(event.target.value)} />
      </QuestionnaireItem>
      <QuestionnaireItem name="referral" disabled={state.authPending}>
        <QuestionnaireTitle>How did you find Steve?</QuestionnaireTitle>
        <QuestionnaireDescription>Optional.</QuestionnaireDescription>
        <QuestionnaireInput value={referral} maxLength={160} aria-label="How did you find Steve?" onChange={event => setReferral(event.target.value)} />
      </QuestionnaireItem>
      <QuestionnaireNav>
        <QuestionnaireSubmit render={<Button type="submit" size="sm" disabled={state.authPending || !purpose} />}>{state.authPending ? "Continuing…" : "Continue"}</QuestionnaireSubmit>
      </QuestionnaireNav>
      <p className="oak-account-intake__note">Sign-in keeps access to this conversation. It does not save history or connect a model account.</p>
    </Questionnaire> : <p role="status">Sign-in is unavailable right now. Keep your draft and check again when ready.</p>}
    {state.authError && !reason ? <p role="status">{state.authError}</p> : null}
  </>;
  // Signing in is a workflow panel; before that, the prompt sits inline under the conversation.
  // Review v4 (Emergent, Starling): sign-in being off is a passing state, so it is one quiet inline notice (a small tile,
  // one bold line, one plain line, two actions), not a full-height card with a large mascot.
  if (unavailable) return <section className="oak-account-intake oak-account-notice" aria-labelledby="oak-account-heading">
    <span className="oak-account-notice__tile" aria-hidden="true"><Icon name="login" /></span>
    <div className="oak-account-notice__body">
      <h2 id="oak-account-heading">{title}</h2>
      {body}
    </div>
  </section>;
  return state.authOpen ? <WorkflowPanel title={title} pose={pose} onReturn={closeOakSignIn} className="oak-account-intake">{body}</WorkflowPanel>
    : <section className="oak-account-intake" aria-labelledby="oak-account-heading">
      {/* D116: the state's art stands large on the panels' tinted halo, over its title, line and action (an Empty, Polarsteps). */}
      <Empty>
        <EmptyHeader>
          <EmptyMedia aria-hidden="true"><span className="oak-panel-hero" data-tone={oakHeroTone(pose)}><OakSprite pose={pose} size="large" /></span></EmptyMedia>
          <EmptyTitle><h2 id="oak-account-heading">{title}</h2></EmptyTitle>
        </EmptyHeader>
        <EmptyContent>{body}</EmptyContent>
      </Empty>
    </section>;
}
