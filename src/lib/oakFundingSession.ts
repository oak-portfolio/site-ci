import { FUNDING_CONTENT_GUARD_HEADER, type FundingResponse, type FundingStatus, type VisitorFundingSession, type ModelReadingAcknowledgement } from '../../packages/oak-agent-contracts/src/funding';

export type OakFundingState = Readonly<{
  selected: 'sponsored' | 'visitor';
  phase: 'disconnected' | 'connecting' | 'oauth-pending' | 'connected' | 'expired';
  status: FundingStatus | null; notice: string | null;
}>;
const initial: OakFundingState = Object.freeze({ selected: 'sponsored', phase: 'disconnected', status: null, notice: null });

/** Isolated from conversation, saved history and browser storage. */
export class OakFundingMemory {
  private state: OakFundingState = initial;
  private session: VisitorFundingSession | null = null;
  private generation = 0;
  private listeners = new Set<() => void>();
  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<OakFundingState>) { this.state = Object.freeze({ ...this.state, ...patch }); this.listeners.forEach(listener => listener()); }
  select(selected: OakFundingState['selected']) { this.update({ selected, notice: null }); }
  begin() { this.session = null; this.update({ phase: 'connecting', status: null, notice: null }); return ++this.generation; }
  pending(token: number) { if (token === this.generation) this.update({ phase: 'oauth-pending' }); }
  current(token: number) { return token === this.generation; }
  revision() { return this.generation; }
  notice(notice: string) { this.update({ notice }); }
  accept(token: number, response: Extract<FundingResponse, { kind: 'connection' }>) {
    if (!this.current(token) || response.status.state !== 'connected') return false;
    this.session = response.session;
    this.update({ phase: 'connected', status: response.status, notice: 'Connected for this browser tab. Send when you are ready.' });
    return true;
  }
  observe(status: FundingStatus) {
    if (!this.session || status.state !== 'connected') return;
    this.update({ status, phase: 'connected' });
  }
  clear(notice = 'Disconnected. Your key still works until you revoke it.', expired = false) {
    const previous = this.session; this.session = null; ++this.generation;
    this.update({ phase: expired ? 'expired' : 'disconnected', status: null, notice });
    return previous;
  }
  connection() { return this.session ? { ...this.session } : null; }
  submission(now = Date.now(), requireModelReading = false): Readonly<{ funding: 'sponsored' | 'visitor'; visitorSession?: VisitorFundingSession; modelReadingAcknowledgement?: ModelReadingAcknowledgement }> {
    if (this.state.selected === 'sponsored') {
      if (requireModelReading) throw new Error('visitor-funding-required');
      return { funding: 'sponsored' };
    }
    if (!this.session || this.state.phase !== 'connected' || !this.state.status?.expiresAt || now >= this.state.status.expiresAt)
      throw new Error('visitor-funding-required');
    const policy = this.state.status.modelReadingPolicy;
    if (requireModelReading && !policy) throw new Error('model-reading-policy-required');
    return { funding: 'visitor', visitorSession: { ...this.session },
      ...(requireModelReading && policy ? { modelReadingAcknowledgement: { revision: policy.revision, loopReserveMicroUsd: policy.loopReserveMicroUsd } } : {}) };
  }
}
export const oakFundingMemory = new OakFundingMemory();
export const getOakFundingSelection = (requireModelReading = false) => oakFundingMemory.submission(Date.now(), requireModelReading);
export const oakFundingContentGuardHeaders = (): Readonly<Record<string, string>> => {
  const session = oakFundingMemory.connection();
  if (!session) return Object.freeze({});
  return Object.freeze({ [FUNDING_CONTENT_GUARD_HEADER]: JSON.stringify(session) });
};
export const subscribeOakFunding = oakFundingMemory.subscribe;
export const getOakFundingState = oakFundingMemory.getSnapshot;
export const getOakFundingServerState = oakFundingMemory.getServerSnapshot;
