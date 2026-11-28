import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/input';
import { redeemOakGrantCode, OakGrantError } from '@/lib/oakGrantClient';
import { refreshOakAuthStatus, useOakWorkspace } from '@/lib/oakWorkspace';

type GrantNotice = { tone: 'ok' | 'error'; title: string; text: string };
/** Q11-G5: every result says what happened, then what to do next. */
export const oakGrantNotices = {
  redeemed: (granted: number): GrantNotice => ({ tone: 'ok', title: `Added ${granted} answers`,
    text: 'They sit on top of your allowance, so the count above already includes them. Ask your next question whenever you are ready.' }),
  already: (): GrantNotice => ({ tone: 'ok', title: 'This code is already on your allowance',
    text: 'Nothing changed. Your answers from it are in the count above.' }),
  failed: (reason: string): GrantNotice => ({ tone: 'error', title: 'That code did not work',
    text: `${reason} Nothing was used up. If it still fails, ask Steve for a new one.` }),
};

// Q11-G1: "Have a grant code" in the allowance popover asks the funding panel to open this field once.
let grantRequested = false;
export function requestOakGrantCode() { grantRequested = true; }

/** P09-G1: where a visitor pastes the code Steve sent. Works for guests; the new count appears in "Answers left" above. */
export function OakGrantRedeem() {
  const field = useRef<HTMLInputElement>(null);
  const disclosure = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  // Gallery only: a `grantFixture` workspace key seeds the result line; the live store never sets it.
  const fixture = (useOakWorkspace() as { grantFixture?: { granted?: number; error?: string } }).grantFixture;
  const [notice, setNotice] = useState<GrantNotice | null>(() => fixture?.error ? oakGrantNotices.failed(fixture.error)
    : fixture?.granted ? oakGrantNotices.redeemed(fixture.granted) : null);
  useEffect(() => {
    if (!grantRequested && !fixture) return;
    const asked = grantRequested; grantRequested = false;
    if (disclosure.current) disclosure.current.open = true;
    // The panel focuses its heading when it opens (after this effect), so the asked-for field takes focus a frame later.
    if (asked) requestAnimationFrame(() => field.current?.focus());
  }, [fixture]);
  const redeem = async () => {
    const code = field.current?.value.trim() ?? '';
    if (!code || busy) return;
    setBusy(true); setNotice(null);
    try {
      const result = await redeemOakGrantCode(code);
      if (field.current) field.current.value = '';
      setNotice(result.redeemed ? oakGrantNotices.redeemed(result.granted) : oakGrantNotices.already());
      void refreshOakAuthStatus();
    } catch (error) {
      setNotice(oakGrantNotices.failed(error instanceof OakGrantError ? error.message : 'Could not use that code. Try again in a moment.'));
    } finally { setBusy(false); }
  };
  return <details ref={disclosure} className="oak-funding__terms oak-funding__paste">
    <summary><Icon name="gift" />Have a grant code?</summary>
    <Field>
      <FieldLabel htmlFor="oak-grant-code">Grant code from Steve</FieldLabel>
      <div className="oak-funding__key-row">
        <Input ref={field} id="oak-grant-code" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={64}
          disabled={busy} placeholder="OAK-XXXXX-XXXXX-…" aria-describedby="oak-grant-note"
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void redeem(); } }} />
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void redeem()}>Use code</Button>
      </div>
      <FieldDescription id="oak-grant-note">A code works once and adds answers on top of your allowance. No sign-in needed.</FieldDescription>
    </Field>
    {notice ? <div className="oak-grant__result" data-tone={notice.tone} role={notice.tone === 'error' ? 'alert' : 'status'}>
      <Icon name={notice.tone === 'error' ? 'alert' : 'checkmark'} />
      <p><strong>{notice.title}</strong>{notice.text}</p>
    </div> : null}
  </details>;
}
