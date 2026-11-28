import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { Icon } from "@/components/ui/Icon";
import { oakBridgeAllowed } from "@/lib/oakBridgeOnce";
import { isWork, oakBridgeInvitationDraws } from "@/lib/oakBridgeInvitation";
import { oakBridgeAreaFor, oakBridgeTopicFor, type OakBridgeArea, type OakBridgeTopic } from "@/data/oakBridgeTopics";
import { useOakRecordFacts, type OakWorkFacts } from "@/lib/oakRecordFacts";
import { oakQuoteBlockOn } from "@/lib/oakFlags/quote";
import { oakLazyView } from "../figure/oakLazyView";
import { ClaimList, OakArt, usePending } from "../cards";
import { Claim, claimId, SkelBar, useScope } from "../scope";
import { ProposalView } from "./Proposal";
import { QuoteSlideView, type QuoteSlide } from "./QuoteSlide";

type Mode = "quote" | "quotes" | "bridge";
type Props = { slides: readonly QuoteSlide[] };

const artOf = (facts: OakWorkFacts) => facts.artifacts[0]?.image ?? facts.cover;

function QuoteGhost() {
  return <div className="oak-quote oak-openui-skel" data-pending="" aria-hidden="true">
    <span className="oak-quote__words"><SkelBar size="long" /><SkelBar size="long" /><SkelBar size="short" /></span>
  </div>;
}

const QuoteList = ({ slides }: Props) => <ul className="oak-quote__list">{slides.map((slide, index) =>
  <li key={slide.key}><QuoteSlideView slide={slide} index={index} total={slides.length} /></li>)}</ul>;
const Carousel = oakLazyView<Props>(() => import("./QuoteCarousel"), ({ slides }) => <QuoteSlideView slide={slides[0]!} index={0} total={slides.length} />, QuoteList);

/** The record behind each claim's first citation, once each, with its reviewed facts: pending while any is still loading. */
function useRecords(ids: readonly string[]) {
  const { claims, knowledgeRevision = "" } = useScope();
  const documents = [...new Set(ids.flatMap(id => claims.get(id)?.citations[0]?.documentId ?? []))].slice(0, 4);
  const states = [0, 1, 2, 3].map(index => useOakRecordFacts(documents[index] ?? "", knowledgeRevision));
  const waiting = documents.some((_, index) => states[index]!.status === "pending");
  const loaded = documents.flatMap((documentId, index) => {
    const state = states[index]!;
    return state.status === "loaded" && isWork(state.facts) ? [{ documentId, facts: state.facts }] : [];
  });
  return { waiting, loaded };
}

function useName() {
  const { claims, cardOf, renderLink } = useScope();
  return (documentId: string, fallbackClaim?: string): React.ReactNode => {
    const claim = fallbackClaim ? claims.get(fallbackClaim) : [...claims.values()].find(item => item.citations[0]?.documentId === documentId);
    const source = claim ? cardOf?.(claim) : null;
    const name = source?.title.split(":")[0]!.trim() || documentId.replace(/^[^:]*:/, "");
    return source?.verified && renderLink ? renderLink(source.page, name) : name;
  };
}

function PullQuote({ ids }: { ids: readonly string[] }) {
  const { loaded, waiting } = useRecords(ids.slice(0, 1));
  const name = useName();
  const ghost = usePending(ids);
  if (waiting || ghost) return <QuoteGhost />;
  const record = loaded[0];
  if (!record) return <ClaimList ids={ids} />;
  return <figure className="oak-quote" data-mode="quote">
    <blockquote className="oak-quote__words"><p>{record.facts.dek}</p></blockquote>
    <figcaption className="oak-quote__name"><span className="oak-quote__lead"><Claim id={ids[0]!} /></span><span>{name(record.documentId, ids[0])}</span></figcaption>
    {ids.length > 1 ? <ClaimList ids={ids.slice(1)} /> : null}
  </figure>;
}

function Quotes({ ids }: { ids: readonly string[] }) {
  const { loaded, waiting } = useRecords(ids);
  const name = useName();
  const ghost = usePending(ids);
  if (waiting || ghost) return <QuoteGhost />;
  if (!loaded.length) return <ClaimList ids={ids} />;
  const slides: QuoteSlide[] = loaded.map(({ documentId, facts }) => ({ key: documentId, words: facts.dek, name: name(documentId), image: artOf(facts) }));
  return <div className="oak-quote" data-mode="quotes">
    <ClaimList ids={ids} />
    {slides.length > 1 ? <Carousel slides={slides} /> : <QuoteSlideView slide={slides[0]!} index={0} total={1} />}
  </div>;
}

function Invitation({ ids }: { ids: readonly string[] }) {
  const { id, proposal, claims, knowledgeRevision = "", proposed = false } = useScope();
  const [allowed] = React.useState(() => oakBridgeInvitationDraws(ids.map(item => claims.get(item)?.text ?? "").join(" "), knowledgeRevision, id, proposal, proposed) && oakBridgeAllowed("invitation", id));
  return allowed && proposal ? <ProposalView action={proposal} label="" /> : null;
}

function BridgeCard({ ids, row }: { ids: readonly string[]; row: OakBridgeTopic }) {
  const { renderLink, knowledgeRevision = "" } = useScope();
  const state = useOakRecordFacts(row.documentId, knowledgeRevision);
  if (state.status === "pending") return <><ClaimList ids={ids} /><QuoteGhost /></>;
  if (state.status !== "loaded" || !isWork(state.facts)) return <ClaimList ids={ids} />;
  const art = artOf(state.facts);
  const url = row.anchor ? `${row.page}#${row.anchor}` : row.page;
  return <div className="oak-quote oak-bridge" data-mode="bridge">
    <ClaimList ids={ids} />
    <article className="oak-bridge__card" aria-label={`From ${row.name}`}>
      <div className="oak-bridge__body">
        <p className="oak-bridge__tag">{state.facts.category} &middot; {row.topic}</p>
        <blockquote className="oak-quote__words"><p>{row.quote}</p></blockquote>
        <p className="oak-quote__name">{renderLink ? renderLink(url, row.name) : row.name}</p>
      </div>
      <OakArt className="oak-bridge__art" src={art.src} alt={art.alt} ratio={art.ratio} />
    </article>
    <Invitation ids={ids} />
  </div>;
}

function Related({ ids, row }: { ids: readonly string[]; row: OakBridgeArea }) {
  const { id, renderLink } = useScope();
  const [allowed] = React.useState(() => oakBridgeAllowed("related", id));
  return <>
    <ClaimList ids={ids} />
    {allowed ? <p className="oak-bridge__related"><Icon name="link" size={14} /><span>Related: {renderLink ? renderLink(row.page, row.name) : row.name}, {row.phrase}</span></p> : null}
  </>;
}

function Bridge({ ids }: { ids: readonly string[] }) {
  const { claims } = useScope();
  const text = ids.map(id => claims.get(id)?.text ?? "").join(" ");
  const topic = oakBridgeTopicFor(text);
  const area = topic ? undefined : oakBridgeAreaFor(text);
  if (topic) return <BridgeCard ids={ids} row={topic} />;
  return area ? <Related ids={ids} row={area} /> : <ClaimList ids={ids} />;
}

function QuoteView({ claims: ids, mode }: { claims: readonly string[]; mode?: Mode }) {
  if (!oakQuoteBlockOn()) return <ClaimList ids={ids} />;
  return mode === "bridge" ? <Bridge ids={ids} /> : mode === "quotes" ? <Quotes ids={ids} /> : <PullQuote ids={ids} />;
}

export const Quote = defineComponent({
  name: "Quote",
  description: "Steve's own published words, when the visitor asks how he approaches or thinks about a method or topic (\"How does Steve approach evals?\", \"What does Steve think about multi-agent teams?\"). The app supplies the words from the cited case study. Mode quote (default): one pull quote; quotes: the claims cite 2 or 3 case studies; bridge: a general theme across projects. Never for a list of projects.",
  props: z.object({ claims: z.array(claimId), mode: z.enum(["quote", "quotes", "bridge"]).optional() }),
  component: ({ props }) => <QuoteView claims={props.claims} mode={props.mode} />,
});
