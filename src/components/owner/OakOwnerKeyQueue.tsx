import { useCallback, useEffect, useState, type DragEvent, type ReactElement } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Disclosure } from '@/components/ui/disclosure';
import { Field, FieldLabel } from '@/components/ui/field';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MeterBar } from '@/components/ui/meter';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { OakOwnerKeysError, requestOakOwnerKeys, type OakKeyAction, type OakKeyProvider, type OakKeyQueueView, type OakKeySlot } from '@/lib/oakOwnerKeysClient';

const names: Record<OakKeyProvider, string> = { openrouter: 'OpenRouter', exa: 'Exa', deepgram: 'Deepgram' };
const stateNames: Record<OakKeySlot['state'], string> = { active: 'Active', queued: 'Queued', exhausted: 'Exhausted', disabled: 'Disabled', retired: 'Retired' };
const errors: Record<string, string> = { 'key-test-failed': 'That key failed its test call, so it was not added.', 'key-queue-duplicate-key': 'That key is already in the queue.',
  'key-queue-master-key-missing': 'Sealing is not set up yet (KEY_QUEUE_MASTER_KEY), so keys cannot be stored.', 'key-queue-no-tested-spare': 'There is no tested spare to promote.',
  'key-queue-active-key': 'Promote another key before retiring the active one.',
  'key-queue-invalid-record': 'The account record does not match this key. Paste the record made for this key (see the oak-key-queue skill).' };
const usd = (micro: number | null) => micro === null ? 'Unknown' : `$${(micro / 1e6).toFixed(2)}`;
const day = (at: number | null) => at === null ? 'never' : new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
/** Color only where it carries meaning: a low meter, an exhausted or missing key. */
const low = (slot: OakKeySlot | null) => (slot?.percentUsed ?? 0) >= 75;

function Tip({ label, children }: { label: string; children: ReactElement }) {
  return <Tooltip><TooltipTrigger render={children} /><TooltipContent>{label}</TooltipContent></Tooltip>;
}

function ActiveCard({ slot, provider, busy, run }: { slot: OakKeySlot | null; provider: OakKeyProvider; busy: boolean; run: (a: OakKeyAction) => void }) {
  if (!slot) return <div className="oak-keys__card oak-keys__card--empty"><p>No active {names[provider]} key in the queue. The Worker uses its single configured key until you promote one.</p></div>;
  return <div className="oak-keys__card" data-low={low(slot) || undefined}>
    <div className="oak-keys__row"><span className="oak-keys__key"><Icon name="key" /> …{slot.last4}</span><span>{slot.label}</span><Badge variant="default">Active</Badge></div>
    <div className="oak-keys__row oak-keys__figures">
      <strong>{slot.remainingMicroUsd === null ? 'Credit unknown' : `${usd(slot.remainingMicroUsd)} left of ${usd(slot.knownCreditMicroUsd)}`}</strong>
      <span>{slot.percentUsed === null ? 'usage estimated' : `${slot.percentUsed}% used`}</span>
    </div>
    {slot.percentUsed !== null ? <span className="oak-keys__meter" data-low={low(slot) || undefined}><MeterBar value={slot.percentUsed} max={100} aria-label={`${slot.percentUsed}% of this key's credit used`} /></span> : null}
    <div className="oak-keys__row oak-keys__meta">
      <span>{slot.runwayDays === null ? 'Runway unknown until it has spent for a day' : `About ${slot.runwayDays} days of runway`}</span>
      <span>Promoted {day(slot.promotedAt)}</span>
      <span className="oak-keys__actions">
        <Tip label="Make one small paid call to check this key still works"><Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ action: 'test', slotId: slot.slotId })}><Icon name="testTube" /> Test</Button></Tip>
        <Tip label="Stop using this key and promote the next tested spare"><Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ action: 'disable', slotId: slot.slotId })}>Disable</Button></Tip>
      </span>
    </div>
  </div>;
}

function QueueRow({ slot, index, busy, run, provider, onDrag }: { slot: OakKeySlot; index: number; busy: boolean; provider: OakKeyProvider;
  run: (a: OakKeyAction) => void; onDrag: { start: (e: DragEvent) => void; over: (e: DragEvent) => void; drop: (e: DragEvent) => void; move: (by: number) => void } }) {
  return <li className="oak-keys__item" draggable={!busy} onDragStart={onDrag.start} onDragOver={onDrag.over} onDrop={onDrag.drop} data-slot-id={slot.slotId}>
    <Tip label="Drag to set the order, or use the arrow keys"><button type="button" className="oak-keys__grip" aria-label={`Move key ending ${slot.last4}`}
      onKeyDown={event => { if (event.key === 'ArrowUp') { event.preventDefault(); onDrag.move(-1); } if (event.key === 'ArrowDown') { event.preventDefault(); onDrag.move(1); } }}>
      <Icon name="dragHandle" /></button></Tip>
    <span className="oak-keys__position">{index + 1}</span>
    <div className="oak-keys__item-body">
      <div className="oak-keys__row"><span className="oak-keys__key">…{slot.last4}</span><span>{slot.label}</span>
        <span>{slot.knownCreditMicroUsd === null ? 'credit unknown' : usd(slot.knownCreditMicroUsd)}</span><Badge variant="secondary">Queued</Badge></div>
      <div className="oak-keys__row oak-keys__meta"><span>Tested {day(slot.testedAt)}</span>
        <span className="oak-keys__actions">
          <Tip label="Make this key active now"><Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ action: 'promote', provider, slotId: slot.slotId })}>Promote</Button></Tip>
          <Tip label="Make one small paid call to check this key"><Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ action: 'test', slotId: slot.slotId })}><Icon name="testTube" /> Test</Button></Tip>
          <Tip label="Take it out of the queue for good. History keeps the record."><Button size="sm" variant="ghost" disabled={busy}
            onClick={() => { if (window.prompt(`Type ${slot.last4} to retire this key`) === slot.last4) run({ action: 'retire', slotId: slot.slotId }); }}>Retire</Button></Tip>
        </span></div>
    </div>
  </li>;
}

function AddKeySheet({ provider, open, onOpenChange, busy, run }: { provider: OakKeyProvider; open: boolean; onOpenChange: (o: boolean) => void; busy: boolean; run: (a: OakKeyAction) => Promise<boolean> }) {
  const [label, setLabel] = useState(''), [key, setKey] = useState(''), [credit, setCredit] = useState(''), [record, setRecord] = useState('');
  useEffect(() => { if (!open) { setLabel(''); setKey(''); setCredit(''); setRecord(''); } }, [open]);
  // Exa and Deepgram keys carry the account record that pins their hash and plan limits; OpenRouter needs none.
  const needsRecord = provider !== 'openrouter';
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent open={open}>
      <DialogTitle>Add a key for {names[provider]}</DialogTitle>
      <DialogDescription>The key is tested with one small call before it joins the queue. It is sealed at once and never shown again, only its last 4 characters.</DialogDescription>
      <form className="oak-keys__sheet-form" onSubmit={async event => { event.preventDefault(); const dollars = credit.trim() ? Number(credit) : null;
        if (await run({ action: 'add', provider, label: label.trim(), key: key.trim(), knownCreditMicroUsd: dollars === null || !Number.isFinite(dollars) ? null : Math.round(dollars * 1e6),
          ...(needsRecord ? { record: record.trim() } : {}) })) onOpenChange(false); }}>
        <Field><FieldLabel htmlFor="oak-key-label">Label</FieldLabel><Input id="oak-key-label" required maxLength={60} value={label} placeholder="Exa account 2" onChange={e => setLabel(e.target.value)} /></Field>
        <Field><FieldLabel htmlFor="oak-key-value">Key</FieldLabel><Input id="oak-key-value" required type="password" autoComplete="off" spellCheck={false} value={key} onChange={e => setKey(e.target.value)} /></Field>
        <Field><FieldLabel htmlFor="oak-key-credit">Known credit in dollars (optional)</FieldLabel><Input id="oak-key-credit" inputMode="decimal" value={credit} placeholder="200" onChange={e => setCredit(e.target.value)} /></Field>
        {needsRecord ? <Field><FieldLabel htmlFor="oak-key-record">Account record</FieldLabel>
          <Textarea id="oak-key-record" required rows={4} spellCheck={false} value={record} placeholder="The JSON record for this key's account and plan" onChange={e => setRecord(e.target.value)} /></Field> : null}
        <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={busy || !label.trim() || key.trim().length < 8 || (needsRecord && record.trim().length < 2)}>{busy ? 'Testing…' : 'Test and add'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

/** P08-G4: the Key queue on /owner/services. One provider at a time, active key, ordered spares, folded history. */
export function OakOwnerKeyQueue() {
  const [view, setView] = useState<OakKeyQueueView | null>(null), [provider, setProvider] = useState<OakKeyProvider>('openrouter');
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState<string | null>(null), [adding, setAdding] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const run = useCallback(async (action?: OakKeyAction) => {
    setBusy(true); setNotice(null);
    try {
      const { result, view } = await requestOakOwnerKeys(action); setView(view);
      if (action?.action === 'test') setNotice((result as { passed?: boolean })?.passed ? 'Test passed.' : 'Test failed. The key stays where it is; check it with the provider.');
      return true;
    } catch (error) {
      setNotice(error instanceof OakOwnerKeysError ? errors[error.code] ?? (error.status === 403 || error.status === 401 ? null : 'The key queue could not be reached.') : 'The key queue could not be reached.');
      return false;
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { void run(); }, [run]);
  if (!view) return notice ? <p className="oak-owner__note" role="status">{notice}</p> : null;
  const current = view.providers.find(item => item.provider === provider)!;
  const order = current.queue.map(slot => slot.slotId);
  const reorder = (ids: string[]) => { if (ids.join() !== order.join()) void run({ action: 'reorder', provider, slotIds: ids }); };
  const moveTo = (id: string, target: number) => { const ids = order.filter(x => x !== id); ids.splice(Math.max(0, Math.min(ids.length, target)), 0, id); reorder(ids); };
  return <TooltipProvider delay={220} closeDelay={80}><section aria-labelledby="oak-owner-keys" className="oak-keys">
    <div className="oak-keys__head"><h2 id="oak-owner-keys">Keys</h2>
      <Button size="sm" disabled={busy || view.sealing !== 'ready'} onClick={() => setAdding(true)}><Icon name="add" /> Add key</Button></div>
    <div className="oak-keys__pills" role="tablist" aria-label="Provider">
      {view.providers.map(item => <button key={item.provider} type="button" role="tab" aria-selected={item.provider === provider} className="oak-keys__pill"
        onClick={() => setProvider(item.provider)}>{names[item.provider]}{item.needsAttention ? <span className="oak-keys__dot" data-tone={item.active ? 'warning' : 'danger'} aria-label="needs attention" /> : null}</button>)}
    </div>
    {view.sealing !== 'ready' ? <p className="oak-keys__warning" role="status"><Icon name="alert" /> Sealing is off: set the KEY_QUEUE_MASTER_KEY Worker secret before adding keys.</p> : null}
    {notice ? <p className="oak-owner__note" role="status">{notice}</p> : null}
    <ActiveCard slot={current.active} provider={provider} busy={busy} run={action => { void run(action); }} />
    <div className="oak-keys__head"><h3>Queue <span className="oak-owner__note">({current.queue.length} ready)</span></h3>{current.queue.length > 1 ? <span className="oak-owner__note">Drag to set the order</span> : null}</div>
    {current.queue.length === 0 ? <p className="oak-keys__warning" role="status"><Icon name="alert" /> No tested spare. Add a key before the active one runs out.</p> :
      <ol className="oak-keys__list">{current.queue.map((slot, index) => <QueueRow key={slot.slotId} slot={slot} index={index} busy={busy} provider={provider}
        run={action => { void run(action); }} onDrag={{
          start: event => { setDragged(slot.slotId); event.dataTransfer.effectAllowed = 'move'; },
          over: event => { if (dragged) event.preventDefault(); },
          drop: event => { event.preventDefault(); if (dragged && dragged !== slot.slotId) moveTo(dragged, index); setDragged(null); },
          move: by => moveTo(slot.slotId, index + by) }} />)}</ol>}
    {provider === 'openrouter' && view.vertex?.length ? <div className="oak-keys__vertex"><h3>Vertex spend by Google account</h3>
      <ul className="oak-keys__list">{view.vertex.map(budget => <li key={budget.budgetId} className="oak-keys__item">
        <div className="oak-keys__item-body"><div className="oak-keys__row"><span>{budget.name}</span><strong>{usd(budget.costMicroUsd)} of {usd(budget.budgetMicroUsd)}</strong><span>{budget.percentUsed}% used</span></div>
          <span className="oak-keys__meter" data-low={budget.percentUsed >= 75 || undefined}><MeterBar value={Math.min(100, budget.percentUsed)} max={100} aria-label={`${budget.name} ${budget.percentUsed}% used`} /></span></div>
      </li>)}</ul></div> : null}
    {current.history.length || current.events.length ? <Disclosure summary="History" count={current.history.length}>
      <ul className="oak-keys__history">{current.events.map((event, i) => <li key={i}><span>{day(event.at)}</span> {event.kind}{event.detail ? `: ${event.detail}` : ''}</li>)}
        {current.history.map(slot => <li key={slot.slotId}><span>…{slot.last4}</span> {slot.label}, {stateNames[slot.state].toLowerCase()} {day(slot.endedAt)}{slot.reason ? ` (${slot.reason})` : ''}</li>)}</ul>
    </Disclosure> : null}
    <AddKeySheet provider={provider} open={adding} onOpenChange={setAdding} busy={busy} run={run} />
  </section></TooltipProvider>;
}
