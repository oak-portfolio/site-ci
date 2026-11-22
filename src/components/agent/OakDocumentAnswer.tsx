import * as React from 'react';
import { Icon } from '@/components/ui/Icon';
import { oakKindUnresolvedOn } from '@/lib/oakFlags/kindUnresolved';
import { oakDocumentName, useOakDocumentsWorkspace } from '@/lib/oakDocumentsWorkspace';
import type { OakDocumentAnswer as DocumentAnswer } from '../../../packages/oak-agent-contracts/src/types';
import { privateDocumentCitationLabel, privateDocumentSource } from '../../../packages/oak-agent-contracts/src/document-answer';
import { OakSprite } from './OakActivitySprite';
import '@/styles/agent/request-kinds.css';

/**
 * React escapes exact visitor quotations, shown exactly as the Worker validated them (an attribution or quote marks in the
 * visitor's own text stay, so the quote matches its citation, coverage and copied text). Private citations never become links.
 * v3 review: the card names the file the quotes came from, each quote says where it sits in plain words (its page, or
 * nothing more than the file), and coverage reads as a small meter instead of character counts. Exports keep the precise
 * label (privateDocumentCitationLabel), which stays the accessible description of each quote.
 */
export function OakDocumentAnswer({ answer }: { answer: DocumentAnswer }) {
  const id = React.useId();
  const documents = useOakDocumentsWorkspace();
  const names = [...new Set(answer.claims.map(claim => oakDocumentName(documents, privateDocumentSource(claim.citation.sourceId)?.documentId ?? '')))];
  const share = Math.round(answer.coverage.quotedUtf16 / answer.coverage.includedUtf16 * 100);
  const kind = names[0]?.toLowerCase().endsWith('.pdf') ? 'doc-pdf' : names[0]?.toLowerCase().endsWith('.docx') ? 'doc-docx' : 'doc-text';
  // Ticket 60 (kdoc): question sentences inside longer quotes, once each, from this private answer only; never sent, saved or exported.
  const open = oakKindUnresolvedOn() ? raisedQuestions(answer.claims) : [];
  return <section className="oak-document-answer oak-answer-card" aria-label="Answer from your document">
    <header className="oak-document-answer__head">
      <span className="oak-document-answer__file" aria-hidden="true"><OakSprite pose={kind} size="badge" /></span>
      {/* Review v7: the name and what was quoted read as one title block, like a file attachment's header. */}
      <span className="oak-document-answer__title">
        <span className="oak-document-answer__name">{names.join(', ')}</span>
        <span className="oak-document-answer__meta">{share}% of your selection quoted</span>
      </span>
      <span className="oak-document-answer__count">{answer.claims.length} {answer.claims.length === 1 ? 'quote' : 'quotes'}</span>
    </header>
    <div className="oak-document-answer__quotes">
    {answer.claims.map((claim, index) => <figure key={claim.id} className="oak-document-answer__quote" aria-describedby={`${id}-document-${index}`}>
      <Icon name="quote" size={16} className="oak-document-answer__mark" />
      <blockquote>{claim.quote}</blockquote>
      <figcaption>{claim.citation.sourcePage !== undefined ? <span className="oak-document-answer__where"><Icon name="bookOpenText" size={12} />Page {claim.citation.sourcePage}</span> : null}
        <span id={`${id}-document-${index}`} className="sr-only">{privateDocumentCitationLabel(claim.citation)}</span></figcaption>
    </figure>)}
    </div>
    {open.length ? <section className="oak-kind-unresolved" aria-labelledby={`${id}-unresolved`}>
      <h4 id={`${id}-unresolved`}><Icon name="question" size={16} />Questions this document raises</h4>
      <ul>{open.map(({ text, page }) => <li key={text}><span>{text}</span>
        {page !== undefined ? <span className="oak-document-answer__where"><Icon name="bookOpenText" size={12} />Page {page}</span> : null}</li>)}</ul>
    </section> : null}
    <footer className="oak-document-answer__foot">
      <p className="oak-document-answer__note"><Icon name="info" size={14} />These are your document’s words. They don’t verify Steve’s experience.</p>
    </footer>
  </section>;
}

/** A quote that is one question already shows on the card, so only questions inside longer quotes are new; the first page wins. */
function raisedQuestions(claims: DocumentAnswer['claims']) {
  const seen = new Map<string, number | undefined>();
  for (const claim of claims) {
    const sentences = claim.quote.trim().split(/(?<=[.?!])\s+/);
    if (sentences.length < 2) continue;
    for (const sentence of sentences) if (sentence.endsWith('?') && !seen.has(sentence)) seen.set(sentence, claim.citation.sourcePage);
  }
  return [...seen].map(([text, page]) => ({ text, page }));
}
