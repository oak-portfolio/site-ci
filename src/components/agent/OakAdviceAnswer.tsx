import * as React from "react";
import type { OakAdviceAnswer as AdviceAnswer } from "../../../packages/oak-agent-contracts/src/types";
import { adviceProposalLabel } from "../../../packages/oak-agent-contracts/src/advice";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { oakSourceDocument, type OakCitationLabels } from "@/lib/oakCitationLabels";
import { oakKindSimilarOn } from "@/lib/oakFlags/kindSimilar";
import { oakMeaningIcons } from "@/lib/oakMeaningIcons";
import { quoteParts } from "@/lib/oakQuote";
import { OakArt } from "@/lib/openui/cards";
import { OakSourceChip } from "./OakSourceChip";
import "@/styles/agent/request-kinds.css";

/** Ticket 60 (ksimilar): the first case study the evidence cites, as Steve's record; never a claim the advice makes. */
function similarBuild(answer: AdviceAnswer, labels: OakCitationLabels | undefined) {
  for (const claim of answer.evidence) for (const citation of claim.citations) {
    const document = oakSourceDocument(citation, answer.knowledgeRevision, labels);
    if (document?.card?.kind === "work") return { claim, document, card: document.card };
  }
  return null;
}

function SimilarBuild({ build }: { build: NonNullable<ReturnType<typeof similarBuild>> }) {
  const { claim, document, card } = build;
  const thumb = document.cover ?? card.image;
  const meta = [card.role, card.period].filter(Boolean).join(" \u00b7 ");
  return <section className="oak-kind-similar" aria-label="What Steve did on a similar build">
    <h4 className="oak-kind-similar__head"><span className="oak-answer-tile" aria-hidden="true"><span className="oak-starter-glyph" data-tone="blue">
      <Icon name="briefcase" size={16} /></span></span><span>What Steve did on a similar build</span><span className="oak-kind-similar__tag">Steve’s record</span></h4>
    <article className="oak-openui-card oak-openui-project">
      <div className="oak-openui-card__head">
        {thumb ? <OakArt className="oak-openui-card__thumb" src={thumb} alt="" ratio={card.imageRatio} /> : null}
        <div className="oak-openui-card__name">
          <h5 className="oak-openui-card__title"><a href={document.canonicalUrl}>{card.title ?? document.title}</a></h5>
          {meta ? <p className="oak-openui-card__meta">{meta}</p> : null}
        </div>
      </div>
      <p className="oak-kind-similar__line">{claim.text}</p>
    </article>
  </section>;
}

/**
 * One proposal card (D130 anatomy): the recommendation leads, assumptions and tradeoffs follow under tinted tiles, the
 * next step is a raised card of its own, the uncertainty is a quiet note, and each piece of public work behind it closes
 * with its source chip. The contact offer closes the card.
 */
export function OakAdviceAnswer({ answer, contactPreference, onBrief, onDecline, citationLabels }: {
  answer: AdviceAnswer; citationLabels?: OakCitationLabels; contactPreference: "open" | "declined"; onBrief: () => void; onDecline: () => void;
}) {
  const id = React.useId();
  const lists = [
    { meaning: "advice.assumption", tone: "blue", title: "Assumptions", items: answer.proposal.assumptions },
    { meaning: "advice.tradeoff", tone: "gold", title: "Tradeoffs", items: answer.proposal.tradeoffs },
  ] as const;
  const build = oakKindSimilarOn() ? similarBuild(answer, citationLabels) : null;
  const card = <section className="oak-advice-card oak-answer-card" aria-label="Scoped project advice">
    <div className="oak-advice-card__lead">
      <h3>{adviceProposalLabel}</h3>
      <p>{answer.proposal.recommendation}</p>
    </div>
    <div className="oak-advice-card__lists">
      {lists.map(list => list.items.length ? <section key={list.title} className="oak-advice-card__list" data-meaning={list.meaning} aria-labelledby={`${id}-${list.meaning}`}>
        <h4 id={`${id}-${list.meaning}`}><span className="oak-answer-tile" aria-hidden="true"><span className="oak-starter-glyph" data-tone={list.tone}>
          <Icon name={oakMeaningIcons[list.meaning]} size={16} /></span></span><span>{list.title}</span></h4>
        <ul>{list.items.map((value, index) => <li key={index}>{value}</li>)}</ul>
      </section> : null)}
    </div>
    <div className="oak-advice-card__next">
      <span className="oak-answer-tile" aria-hidden="true"><span className="oak-starter-glyph" data-tone="leaf"><Icon name={oakMeaningIcons["advice.next-step"]} size={18} /></span></span>
      <div><h4>A useful next step</h4><p>{answer.proposal.nextStep}</p></div>
    </div>
    <p className="oak-advice-card__note"><Icon name={oakMeaningIcons["advice.uncertainty"]} size={16} /><span>{answer.uncertainty}</span></p>
    {answer.evidence.length ? <section className="oak-advice-card__evidence" aria-label="Public work behind this suggestion">
      <h4>Public work behind this suggestion</h4>
      {answer.evidence.map(claim => { const parts = quoteParts(claim.text); return <section key={claim.id} className="oak-answer__point">
        {parts.attributed ? <blockquote className="oak-quote">{parts.quote}</blockquote> : <p>{claim.text}</p>}
        {parts.context ? <p className="oak-quote__when">{parts.context}</p> : null}
        <OakSourceChip citations={claim.citations} knowledgeRevision={answer.knowledgeRevision} citationLabels={citationLabels} />
      </section>; })}
    </section> : null}
    {answer.contactOffer && contactPreference === "open" ? <div className="oak-brief-actions">
      <p>Want to explore this with Steve? Prepare your own message.</p>
      <span className="oak-brief-actions__buttons">
        <Button type="button" variant="secondary" size="sm" onClick={onBrief}><Icon name="mail" />Prepare a contact brief</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDecline}>No thanks</Button>
      </span>
    </div> : null}
  </section>;
  return build ? <><p className="oak-kind-similar__capsule" data-unit=""><Icon name="info" size={14} />Oak AI’s general advice, not Steve’s</p>{card}
    <SimilarBuild build={build} /></> : card;
}
