import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { SignedOutReason } from './reads.ts';
import { clock } from './format.ts';

const fixSteps: Record<SignedOutReason, { title: string; steps: ReactNode[] }> = {
  'no-token': { title: 'No owner token reached the owner API', steps: [
    <>Save the owner token in the Keychain: <code>security add-generic-password -U -s oak-owner-api-token -a "$USER" -w</code></>,
    <>Restart the dev server on loopback with <code>npm run dev</code>. A <code>--host</code> other than 127.0.0.1 turns the token off.</>,
    'Reload this page.',
  ] },
  'same-origin-only': { title: 'The owner proxy only answers this dev server’s own pages', steps: [
    <>Open the console directly in this dev server’s tab, at <code>/owner/console</code> on 127.0.0.1.</>,
    'Requests from another local app or a page on another port are refused on purpose.',
    'Reload this page.',
  ] },
};

export function SignedOut({ reason, retry }: { reason: SignedOutReason; retry: () => void }) {
  const { title, steps } = fixSteps[reason];
  return <section className="oc-state" aria-labelledby="oc-signed-out" data-state="signed-out">
    <span className="oc-state__icon"><Icon name="lock" size={22} /></span>
    <h2 id="oc-signed-out">Signed out</h2>
    <p className="oc-muted">{title}.</p>
    <ol className="oc-steps">{steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
    <Button variant="secondary" onClick={retry}><Icon name="retry" size={16} />Check again</Button>
  </section>;
}

export function Unreachable({ retry }: { retry: () => void }) {
  return <section className="oc-state" aria-labelledby="oc-unreachable" data-state="unreachable">
    <span className="oc-state__icon"><Icon name="offline" size={22} /></span>
    <h2 id="oc-unreachable">Unreachable</h2>
    <p className="oc-muted">The owner API did not answer, and there is no earlier read to show.</p>
    <Button variant="secondary" onClick={retry}><Icon name="retry" size={16} />Retry</Button>
  </section>;
}

export function StaleBar({ at, retry }: { at: number; retry: () => void }) {
  return <div className="oc-stale" role="status">
    <span className="oc-chip" data-tone="watch">Stale</span>
    <span className="oc-muted">The last read failed. Showing the read from <time dateTime={new Date(at).toISOString()}>{clock(at)}</time>.</span>
    <Button variant="secondary" size="sm" onClick={retry}><Icon name="retry" size={16} />Retry</Button>
  </div>;
}

export function NotYet({ icon, title, detail }: { icon: IconName; title: string; detail: string }) {
  return <div className="oc-notyet">
    <span className="oc-state__icon"><Icon name={icon} size={20} /></span>
    <div><p className="oc-notyet__title">{title}</p><p className="oc-muted">{detail}</p></div>
  </div>;
}

export function JsonView({ model, label }: { model: unknown; label: string }) {
  const text = JSON.stringify(model, null, 2);
  const [copied, setCopied] = useState(false);
  return <section className="oc-json" aria-label={`${label} as JSON`}>
    <div className="oc-json__head">
      <span className="oc-muted">Same fields as the {label} tab</span>
      <Button variant="secondary" size="sm" aria-label={`Copy ${label} JSON`}
        onClick={() => void navigator.clipboard?.writeText(text).then(() => setCopied(true))}>
        <Icon name={copied ? 'copyCheck' : 'copy'} size={16} />{copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
    <pre data-console-json tabIndex={0}>{text}</pre>
  </section>;
}
