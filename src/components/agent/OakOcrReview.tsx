import { Attachment, AttachmentContent, AttachmentDescription, AttachmentMedia, AttachmentTitle } from '@/components/ui/attachment';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/Icon';
import { MeterBar } from '@/components/ui/meter';
import { oakMeaningIcons } from '@/lib/oakMeaningIcons';
import { useSyncExternalStore } from 'react';
import { getOakFundingServerState, getOakFundingState, subscribeOakFunding } from '../../lib/oakFundingSession';
import { OakSprite } from './OakActivitySprite';
import { getOakDocumentsController, type OakDocumentsOwner, type OakDocumentsSnapshot } from '../../lib/oakDocumentsWorkspace';

const usd = (microUsd: number) => `USD ${(microUsd / 1_000_000).toFixed(6)}`;
const pagesWord = (count: number) => `${count} ${count === 1 ? 'page' : 'pages'}`;
const DAILY_PAGES = 20;
/**
 * A scanned PDF: one calm card to read its pages with Gemini (ADR 0004). R12: what it is, two short lines on why and who
 * pays, the four facts, a bar of today's pages with this file's share, and one primary action. When reading cannot run
 * (paused, or more pages than are left), the primary action becomes Paste the text. Historical paid attempts keep their status view.
 */
export function OakOcrReview({ owner, state, onPaste }: { owner: OakDocumentsOwner; state: OakDocumentsSnapshot; onPaste?: () => void }) {
  const controller = getOakDocumentsController();
  const funding = useSyncExternalStore(subscribeOakFunding, getOakFundingState, getOakFundingServerState);
  const ownKey = funding.selected === 'visitor' && funding.phase === 'connected';
  if (!state.ocrSource) return null;
  const quote = state.ocrQuote;
  if (!quote || !state.ocrAttempted) {
    const source = state.ocrSource, allowance = state.scanAllowance;
    const tooMany = allowance ? source.pages > allowance.pagesLeft : false, paused = allowance ? !ownKey && !allowance.sponsorAvailable : false;
    const blocked = tooMany || paused;
    const left = allowance?.pagesLeft ?? DAILY_PAGES;
    return <section className="oak-documents__preview oak-ocr" aria-label="Scanned PDF" data-blocked={blocked ? '' : undefined}>
      <div className="oak-ocr__header"><span className="oak-ocr__tile" aria-hidden="true"><Icon name={oakMeaningIcons['panel.ocr']} /></span><h3>Scanned PDF</h3></div>
      <Attachment size="sm" state={state.pending ? 'processing' : 'idle'}>
        <AttachmentMedia><OakSprite pose="doc-pdf" size="badge" /></AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{source.label}</AttachmentTitle>
          {/* Q11-G3: a visitor counts a scan in pages, never bytes. */}
          <AttachmentDescription>PDF · {pagesWord(source.pages)} · scanned images</AttachmentDescription>
        </AttachmentContent>
      </Attachment>
      <div className="oak-ocr__lines">
        <p className="oak-ocr__lead">{paused ? 'Reading scanned pages is paused for now. Paste the text, or connect your own key.' :
          tooMany ? `This PDF has ${pagesWord(source.pages)}, and ${pagesWord(allowance!.pagesLeft)} ${allowance!.pagesLeft === 1 ? 'is' : 'are'} left today. Paste the text, or try a shorter PDF.` :
          'Its pages are pictures, so Oak turns them into text first. Then you choose what Oak reads.'}</p>
        <p className="oak-ocr__lead oak-ocr__privacy"><Icon name="lock" size={14} />{paused ? '' : ownKey ? 'Your connected key pays. ' : 'Free for you, Oak pays. '}The original file is never saved.</p>
      </div>
      {/* R12: the facts that used to sit in a table (pages, reader, payer, pages left) are said once each: the file row, the two
          lines above, and today's pages here, with this file's share. A connected key has no daily page bar. */}
      {ownKey || paused ? null : <div className="oak-ocr__allowance" data-tone={tooMany ? 'over' : undefined}>
        <span className="oak-ocr__allowance-head"><span><Icon name="clock" size={14} />Pages left today</span>
          <span className="oak-ocr__allowance-count">{left} of {DAILY_PAGES}{tooMany ? `, this PDF needs ${source.pages}` : `, this PDF uses ${source.pages}`}</span></span>
        <MeterBar value={left} max={DAILY_PAGES} aria-label={`${pagesWord(left)} of ${DAILY_PAGES} left today. This PDF ${tooMany ? 'needs' : 'uses'} ${pagesWord(source.pages)}.`} />
      </div>}
      <div className="oak-documents__actions">
        {blocked && onPaste ? <Button type="button" size="sm" onClick={onPaste}><Icon name="compose" />Paste the text instead</Button>
          : <Button type="button" size="sm" disabled={state.pending || blocked}
            onClick={() => void controller.confirmScan(owner)}><Icon name="scanImage" />{state.pending ? `Reading ${pagesWord(source.pages)}…` : `Read ${pagesWord(source.pages)}`}</Button>}
        <Button type="button" variant="ghost" size="sm" disabled={state.pending} onClick={() => controller.cancel('ocr-cancel')}>Remove</Button>
      </div>
    </section>;
  }
  const settlement = state.ocrStatus?.state === 'settled' ? state.ocrStatus.settlementReceipt : undefined;
  return <section className="oak-documents__preview oak-ocr" aria-label="Scanned PDF OCR review">
    <div className="oak-ocr__header"><Icon name={oakMeaningIcons['panel.ocr']} /><h3>Scanned PDF review</h3></div>
    <p className="oak-documents__note">Selected PDF: {state.ocrSource.label}</p>
    <p className="oak-documents__note">{state.ocrSource.pages} {state.ocrSource.pages === 1 ? 'page' : 'pages'}. {state.ocrInference ?
      `OCR text is available below. PDF page mapping, visual content and completeness remain unverified. ${settlement ? 'Provider-reported charges are reconciled.' : 'Charges remain unknown.'}` :
      'Scanned-page reading is unavailable right now. Paste the text instead. Existing attempts keep their original status and holds.'}</p>
    {state.ocrInference === 'failed' ? <p className="oak-documents__note">The parser returned text, but model generation failed. Reading this preview does not repeat OCR.</p> : null}
    {settlement ? <p className="oak-documents__note">
      Provider-reported total: {usd(settlement.totalChargeMicroUsd)}. OpenRouter account charge, including parsing: {usd(settlement.openRouterChargeMicroUsd)}.
      {settlement.isByok ? ` Separate BYOK model usage: ${usd(settlement.upstreamInferenceChargeMicroUsd!)}.` : ''}
      {' '}The original holds for this operation are released. Final invoices and the parser/fee breakdown remain unknown. No repeat OCR is authorized.
    </p> : state.ocrStatus?.accounting && (state.ocrStatus.accounting.reportedOpenRouterChargeMicroUsd !== undefined ||
      state.ocrStatus.accounting.upstreamInferenceChargeMicroUsd !== undefined) ? <p className="oak-documents__note">
      {state.ocrStatus.accounting.reportedOpenRouterChargeMicroUsd !== undefined ? `Reported connection charge: ${usd(state.ocrStatus.accounting.reportedOpenRouterChargeMicroUsd)}. ` : ''}
      {state.ocrStatus.accounting.upstreamInferenceChargeMicroUsd !== undefined ? `Separately reported upstream inference charge: ${usd(state.ocrStatus.accounting.upstreamInferenceChargeMicroUsd)}. ` : ''}
      Parser charges and the inclusive total remain unknown. The original parser and model bounds remain held.
    </p> : null}
    {quote && state.ocrAttempted ? <>
      <p>Historical processor: {quote.disclosure.processor}. Recipient: {quote.disclosure.recipient}. Parser: {quote.disclosure.parser}.</p>
      <p className="oak-documents__note">Original parser bound: {usd(quote.parserBoundMicroUsd)}. Separate model bound: {usd(quote.modelBoundMicroUsd)}. These belong to the historical paid operation.</p>
      <div className="oak-documents__actions">
        <Button type="button" variant="secondary" size="sm" disabled={state.pending}
          onClick={() => void controller.checkOcrStatus()}>Check operation status</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => controller.cancel('ocr-cancel')}>Cancel OCR review</Button>
      </div>
    </> : null}
  </section>;
}
