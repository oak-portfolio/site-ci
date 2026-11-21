import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/input';
import { MeterBar } from '@/components/ui/meter';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { RollingNumber } from '@/components/ui/rolling-number';
import { brandIconRegistry } from '@/data/brandIconRegistry';
import type { oakAllowanceSummary } from '@/lib/oakAllowance';
import { getOakWorkspace, openOakSurface, setOakContactBriefInput } from '@/lib/oakWorkspace';
import { openRouterCreditsUrl, openRouterKeysUrl } from '../../../packages/oak-agent-contracts/src/funding';
import { getOakFundingState, getOakFundingServerState, subscribeOakFunding } from '@/lib/oakFundingSession';
import { selectOakFunding, connectOakFundingOAuth, connectOakFundingKey, cancelOakFunding, disconnectOakFunding } from '@/lib/oakFundingClient';
import { OakGrantRedeem, requestOakGrantCode } from './OakGrantRedeem';

/** Q11-G2: OpenRouter's bundled favicon (public/assets/brand-icons), never hotlinked. Decorative; its name is always beside it. */
export function OakOpenRouterMark({ size = 20 }: { size?: number }) {
  return <img className="oak-funding__mark" src={brandIconRegistry.openrouter.assetPath} alt="" width={size} height={size} />;
}

/** Ask Steve for more: the contact brief with the request written in (D127). Words the visitor already wrote stay (D131). */
export function oakAskSteveForMore() {
  openOakSurface('brief');
  if (!getOakWorkspace().briefDraft?.goals.trim())
    setOakContactBriefInput('goals', "I'd like a few more free answers from Oak AI Agent on SteveOak.com so I can keep exploring your work.");
}

/** Q11-G1: the allowance popover's actions reuse the funding panel; neither starts a flow of its own. */
export function oakOpenGrantCode() { requestOakGrantCode(); openOakSurface('funding'); }
export function oakUseOpenRouter(onBeforeChange?: () => void) {
  if (getOakFundingState().selected !== 'visitor') { onBeforeChange?.(); selectOakFunding('visitor'); }
  openOakSurface('funding');
}

/** Same disclosure observed by the explicit Send. It creates no funding or dispatch authority. */
export function OakModelReadingDisclosure({ sourceExpiresAt }: { sourceExpiresAt: number | null }) {
  const state = useSyncExternalStore(subscribeOakFunding, getOakFundingState, getOakFundingServerState);
  const policy = state.status?.modelReadingPolicy;
  const expiresAt = sourceExpiresAt && state.status?.expiresAt ? Math.min(sourceExpiresAt, state.status.expiresAt) : null;
  if (state.selected !== 'visitor' || state.phase !== 'connected' || !policy || !expiresAt || expiresAt <= Date.now())
    return <p className="oak-composer__note oak-model-reading" role="status">Selected scanned-page text needs your connected OpenRouter account and current model terms before Send or Compare. Selection does not send it.</p>;
  const allowance = state.status?.keyAllowance?.remainingMicroUsd;
  const usd = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: value % 10_000 ? 6 : 2 }).format(value / 1_000_000);
  return <section aria-label="Selected text model consent" className="oak-composer__note oak-model-reading">
    <p>Send or Compare uses your OpenRouter account for Oak's answer model. Only selected document text is included, with your question and chat context. Oak reserves up to {usd(policy.loopReserveMicroUsd)} for this answer.</p>
    <details>
      <summary>Model terms and allowance</summary>
      <p>{policy.recipient}. {policy.processing} {policy.retention}</p>
      <p>Key allowance remaining: {allowance === null || allowance === undefined ? 'unknown' : `${usd(allowance)} when checked`}. Provider capacity and final charges are unknown. Permission expires at {new Date(expiresAt).toLocaleTimeString()}.</p>
    </details>
  </section>;
}

/**
 * Two funding sources as one choice. The visitor key stays uncontrolled and masked unless shown, and clears on connect and unmount.
 * Under the sponsored choice, the answers it has left read as one iOS group (the count, a bar, one footnote), the same
 * reading the composer's usage card gives, so the choice is made with the number in view.
 * D127: the visitor's own account is one OpenRouter card (its mark, its state, Connect, and who pays); pasting a key is a
 * folded alternative; the free allowance offers to ask Steve for more as a brief the visitor sends.
 */
export function OakFundingControl({ onBeforeChange, answersLeft }: { onBeforeChange?: () => void; answersLeft?: ReturnType<typeof oakAllowanceSummary> }) {
  const state = useSyncExternalStore(subscribeOakFunding, getOakFundingState, getOakFundingServerState);
  const keyField = useRef<HTMLInputElement>(null);
  const [showKey, setShowKey] = useState(false);
  const pending = state.phase === 'connecting' || state.phase === 'oauth-pending';
  const connected = state.phase === 'connected';
  useEffect(() => () => { if (keyField.current) keyField.current.value = ''; }, []);
  const allowance = state.status?.keyAllowance;
  return <section className="oak-funding" aria-label="Model funding">
    <RadioGroup aria-label="Use funds from" value={state.selected} onValueChange={value => {
      if (value === 'sponsored' || value === 'visitor') { onBeforeChange?.(); selectOakFunding(value); }
    }}>
      <RadioCard value="sponsored" icon="gift" title="Oak sponsored allowance" description="Free answers within Oak’s capped allowance. Switching never resets it." />
      <RadioCard value="visitor" media={<OakOpenRouterMark />} title="My OpenRouter account" description="Your own credits, connected for this tab." />
    </RadioGroup>
    {state.selected === 'sponsored' && answersLeft ? <section className="oak-group oak-funding__allowance" aria-label="Answers left">
      <h3 className="oak-group__header">Answers left</h3>
      <div className="oak-group__body">
        <div className="oak-usage-card__count"><strong><RollingNumber value={answersLeft.remaining} /></strong><span>{answersLeft.label}</span></div>
        <MeterBar value={answersLeft.remaining} max={answersLeft.limit} aria-label={answersLeft.detail} />
      </div>
      {answersLeft.grant ? <p className="oak-group__footnote">{answersLeft.grant}</p> : null}
      <div className="oak-funding__more">
        <Button type="button" variant="secondary" size="sm" onClick={oakAskSteveForMore}><Icon name="mail" />Ask Steve for more answers</Button>
      </div>
      <OakGrantRedeem />
    </section> : null}
    {state.selected === 'visitor' ? <div className="oak-funding__visitor">
      <section className="oak-group oak-funding__provider" aria-label="OpenRouter">
        <div className="oak-group__body oak-funding__connect">
          <OakOpenRouterMark size={36} />
          <div className="oak-funding__provider-text">
            <strong>OpenRouter</strong>
            <span className="oak-funding__state" data-connected={connected || undefined}>
              <span className="oak-funding__dot" aria-hidden="true" />{connected ? 'Connected' : pending ? 'Connecting…' : 'Not connected'}
            </span>
          </div>
          <div className="oak-funding__buttons">
            {pending ? <Button type="button" variant="ghost" size="sm" onClick={() => { onBeforeChange?.(); void cancelOakFunding(); }}>Cancel connection</Button> : null}
            {connected ? <Button type="button" variant="ghost" size="sm" onClick={() => { onBeforeChange?.(); void disconnectOakFunding(); }}>Disconnect</Button> : null}
            <Button type="button" variant={connected ? 'secondary' : 'primary'} size="sm" disabled={pending} onClick={() => { onBeforeChange?.(); void connectOakFundingOAuth(); }}>
              {connected ? 'Reconnect OpenRouter' : 'Connect OpenRouter'}
            </Button>
          </div>
        </div>
        <p className="oak-group__footnote">You sign in on OpenRouter and approve me there. Answers then use your OpenRouter credits, in this tab only.</p>
      </section>
      <details className="oak-funding__terms oak-funding__paste">
        <summary><Icon name="key" />Paste a key instead</summary>
      <Field>
        <FieldLabel htmlFor="oak-funding-key">Your OpenRouter inference key</FieldLabel>
        <div className="oak-funding__key-row">
          <Input ref={keyField} id="oak-funding-key" type={showKey ? 'text' : 'password'} autoComplete="off" autoCapitalize="none" spellCheck={false}
            minLength={8} maxLength={512} disabled={pending} placeholder="sk-or-v1-…" aria-describedby="oak-funding-custody" />
          <Button type="button" variant="ghost" size="icon" aria-label={showKey ? 'Hide key' : 'Show key'} title={showKey ? 'Hide key' : 'Show key'}
            aria-pressed={showKey} aria-controls="oak-funding-key" disabled={pending} onClick={() => setShowKey(value => !value)}>
            <Icon name={showKey ? 'viewOff' : 'view'} />
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => {
            const key = keyField.current?.value ?? ''; if (keyField.current) keyField.current.value = '';
            setShowKey(false); onBeforeChange?.(); void connectOakFundingKey(key);
          }}>Connect key</Button>
        </div>
        <FieldDescription id="oak-funding-custody">Use an inference key, never a management key. This connection stays in this tab and expires after lost contact. Disconnect removes Oak’s access; it does not revoke the key at OpenRouter.</FieldDescription>
      </Field>
      </details>
      <div className="oak-funding__links">
        <a href={openRouterCreditsUrl} target="_blank" rel="noopener noreferrer">Add credits on OpenRouter<Icon name="arrowUpRight" /></a>
        <a href={openRouterKeysUrl} target="_blank" rel="noopener noreferrer">Manage keys on OpenRouter<Icon name="arrowUpRight" /></a>
      </div>
      <details className="oak-funding__terms">
        <summary>Billing and limits</summary>
        <p>Model answers use your OpenRouter account. Search and speech keep their own limits. Connecting does not send a question.</p>
        <p>Buying credits happens on OpenRouter. Returning here does not confirm a purchase. Provider balance is unknown.</p>
        {allowance ? <p>Key allowance remaining: {allowance.remainingMicroUsd === null ? 'no key limit reported, account balance unknown' :
          `$${(allowance.remainingMicroUsd / 1_000_000).toFixed(2)} when checked`}. This is separate from local reservations.</p> : null}
      </details>
    </div> : null}
    {state.notice ? <p className="oak-funding__notice" role="status">{state.notice}</p> : null}
  </section>;
}
