import type { OwnerProviderAccountObservation } from '../../../packages/oak-agent-contracts/src/owner-account-observations';

export const ownerProviderNames = { exa: 'Exa', deepgram: 'Deepgram',
  openrouter: 'OpenRouter', 'google-vertex': 'Google Vertex' } as const;
export const ownerAccountCategoryNames = { credit: 'Credit allowance', 'credit-expiry': 'Credit expiry',
  'credential-expiry': 'Key expiry', 'eligibility-expiry': 'Service eligibility expiry' } as const;
const providers = ['exa', 'deepgram', 'openrouter', 'google-vertex'] as const;
const date = (value: number | null) => value === null ? 'Unknown' : new Date(value).toLocaleString();
function creditAmount(value: number | null, unit: OwnerProviderAccountObservation['credit']['unit']) {
  if (value === null) return 'Unknown';
  if (unit === 'micro-usd') return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value / 1_000_000);
  return `${value.toLocaleString()} ${unit === 'audio-seconds' ? 'seconds' : 'parser credits'}`;
}
function expiry(value: OwnerProviderAccountObservation['creditExpiry'], currentSnapshot: boolean) {
  if (value.state === 'unknown') return 'Unknown';
  const label = value.state === 'non-expiring' ? 'No expiry reported' : date(value.expiresAt);
  return `${currentSnapshot && value.evidence === 'verified' ? '' : 'Last known: '}${label}`;
}
/** Account observations are private. Missing setup and stale evidence never imply fresh credit. */
export function OakOwnerProviderAccounts({ accounts = [], currentSnapshot = true }: {
  accounts?: readonly OwnerProviderAccountObservation[]; currentSnapshot?: boolean;
}) {
  return <section aria-labelledby="oak-owner-provider-accounts">
    <h2 id="oak-owner-provider-accounts">Provider accounts</h2>
    <div className="oak-owner__table-scroll" tabIndex={0} aria-label="Provider accounts, scroll horizontally for all columns">
      <table><caption className="sr-only">Selected account credit and expiry observations</caption>
        <thead><tr><th scope="col">Account</th><th scope="col">Remaining</th><th scope="col">Credit expiry</th><th scope="col">Observation</th></tr></thead>
        <tbody>{providers.map(provider => {
          const account = accounts.find(value => value.provider === provider);
          return <tr key={provider}>
            <th scope="row">{ownerProviderNames[provider]}<br />{account ? <abbr title={account.scope}>Account {account.scope.slice(0, 12)}</abbr> : 'Not connected to monitoring'}</th>
            <td>{account ? <>{!currentSnapshot || account.evidence === 'stale' ? 'Last known: ' : ''}{creditAmount(account.credit.remaining, account.credit.unit)}<br />
              {account.credit.basis === 'key-allowance' ? 'Key spending allowance' : 'Provider credits'}<br />
              Limit: {creditAmount(account.credit.limit, account.credit.unit)}</> : 'Unknown'}</td>
            <td>{account ? expiry(account.creditExpiry, currentSnapshot) : 'Unknown'}
              {account ? <details><summary>Other expiry dates</summary>
                <p>Key: {expiry(account.credentialExpiry, currentSnapshot)}<br />Service eligibility: {expiry(account.eligibilityExpiry, currentSnapshot)}</p>
              </details> : null}</td>
            <td>{account ? <>{currentSnapshot ? account.evidence : 'Last known'}<br />Checked: {date(account.observedAt)}</> : 'Unknown'}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className="oak-owner__note">Credit, key expiry and monthly resets are separate observations. OpenRouter's key allowance and model costs do not establish Google Vertex credits. Switching accounts retains earlier usage, holds and alert history.</p>
  </section>;
}
