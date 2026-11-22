import * as React from "react";
import { oakRecordOnlyBlocksOn } from "@/lib/oakFlags/recordOnlyBlocks";
import type { OakCitationLabels } from "@/lib/oakCitationLabels";
import { OakArt } from "@/lib/openui/cards";
import { oakRoleDuration, oakRoleTitles, oakRoleYears } from "@/lib/openui/components/Role";
import { COVER_OK } from "@/lib/openui/components/ProjectWall";
import { OakGhostColumn, type OakGhostRow } from "@/lib/openui/ghostRows";
import { SkelBar } from "@/lib/openui/scope";
import { oakRecordFactsState, useOakRecordFacts, type OakRecordFact } from "@/lib/oakRecordFacts";
import { OAK_PLAN_RECORD_PREFIX, oakPlanItemCap, type OakAnswerPlan, type OakPlanBlock } from "../../../packages/oak-agent-contracts/src/openui/plan";
import type { OakAnswerUi } from "../../../packages/oak-agent-contracts/src/openui/verdict";
import type { OakAnswer } from "../../../packages/oak-agent-contracts/src/types";

type Claim = Readonly<{ id: string; citations: readonly Readonly<{ documentId: string }>[] }>;
type FactsOf = (documentId: string) => OakRecordFact | null | undefined;

const ownershipLines = (fact: OakRecordFact) => (fact as { ownership?: { oak?: unknown } }).ownership?.oak;

/** The record blocks app rules can draw on their own, each with the fact its cited record must carry. */
const RECORD_BLOCKS: Readonly<Record<string, Readonly<{ one: boolean; draws: (fact: OakRecordFact) => boolean }>>> = {
  Project: { one: false, draws: fact => fact.kind === "work" },
  PageCards: { one: false, draws: fact => fact.kind === "work" },
  Screens: { one: true, draws: fact => fact.kind === "work" && fact.artifacts.some(artifact => artifact.image) },
  Ownership: { one: true, draws: fact => Array.isArray(ownershipLines(fact)) && (ownershipLines(fact) as unknown[]).length > 0 },
};

const RECORD_ONLY_REQUEST = "00000000-0000-4000-8000-000000000046";
const quoted = (claims: readonly Claim[]) => claims.map(claim => JSON.stringify(claim.id)).join(", ");

/**
 * Ticket 46a: the layout a record-only plan draws, built by app rules from the cited records' facts. The first claim is the
 * written lead; each planned record block takes the unplaced claims whose first cited record carries its fact; every other
 * claim lands once in a closing Points. A block that needs the model, or one with no qualifying claim, is not drawn. Null when
 * nothing qualifies, so the turn reads as the plain answer.
 */
export function oakRecordOnlyProgram(plan: OakAnswerPlan, claims: readonly Claim[], factsOf: FactsOf): string | null {
  const [lead, ...rest] = claims;
  if (plan.mode !== "record-only" || !lead) return null;
  const placed = new Set<string>();
  const lines = [`b0 = Prose(${quoted([lead])})`];
  for (const block of plan.blocks.slice(1)) {
    const rule = RECORD_BLOCKS[block.kind];
    if (!rule) continue;
    const take = rest.filter(claim => {
      const fact = placed.has(claim.id) ? null : factsOf(claim.citations[0]?.documentId ?? "");
      return fact ? rule.draws(fact) : false;
    }).slice(0, Math.min(block.count, oakPlanItemCap(block.kind)));
    if (!take.length) continue;
    take.forEach(claim => placed.add(claim.id));
    lines.push(`b${lines.length} = ${block.kind}(${rule.one ? quoted(take) : `[${quoted(take)}]`})`);
  }
  if (lines.length < 2) return null;
  const left = rest.filter(claim => !placed.has(claim.id));
  if (left.length) lines.push(`b${lines.length} = Points([${quoted(left)}])`);
  return [`root = Answer([${lines.map((_, index) => `b${index}`).join(", ")}])`, ...lines].join("\n");
}

/** The layout a record-only turn draws, or the Worker's own `ui` unchanged. While its record facts load, only the lead streams. */
export function useOakRecordOnlyUi(ui: OakAnswerUi | null | undefined, plan: OakAnswerPlan | null | undefined, answer: OakAnswer | null): OakAnswerUi | null | undefined {
  const wanted = !ui && plan?.mode === "record-only" && oakRecordOnlyBlocksOn() && (answer?.kind === "sourced" || answer?.kind === "gap") ? answer : null;
  const revision = wanted?.knowledgeRevision ?? "";
  const loading = useOakRecordFacts("", revision).status === "pending" && wanted?.claims[0];
  const program = loading ? `root = Answer([b0])\nb0 = Prose(${quoted([loading])})` : wanted && plan ? oakRecordOnlyProgram(plan, wanted.claims, id => {
    const state = oakRecordFactsState(id, revision);
    return state.status === "loaded" ? state.facts : null;
  }) : null;
  const status = loading ? "streaming" as const : "done" as const;
  return React.useMemo(() => program ? { requestId: RECORD_ONLY_REQUEST, status, program } : ui, [program, status, ui]);
}

/** What a plan-time card shows: record fields from Steve's own pages (title, cover, role, dates), never claim text. A tile is a ProjectWall's. */
export type OakPlanRecordCard = Readonly<{ kind: "project" | "role" | "tile"; documentId: string; title: string; image?: string; ratio?: number; role?: string; when?: string }>;

/**
 * Ticket 169: the cards each planned Project or Role block can draw before its claims arrive, by plan index. A record the page
 * labels do not carry draws no card, so its ghost stays.
 */
export function oakPlanRecordCards(blocks: readonly OakPlanBlock[], labels: OakCitationLabels | undefined) {
  const cards = new Map<number, OakPlanRecordCard[]>();
  blocks.forEach((block, at) => {
    const prefix = OAK_PLAN_RECORD_PREFIX[block.kind];
    const drawn = (prefix ? block.records ?? [] : []).flatMap((documentId): OakPlanRecordCard[] => {
      const document = documentId.startsWith(prefix!) ? labels?.documents.find(entry => entry.documentId === documentId) : undefined;
      if (!document) return [];
      const card = document.card;
      if (block.kind === "Role") {
        const when = [oakRoleYears(card?.period), oakRoleDuration(card?.period)].filter(Boolean).join(" \u00b7 ");
        return [{ kind: "role", documentId, title: card?.place ?? document.title, ...(card?.image ? { image: card.image, ratio: card.imageRatio } : {}),
          ...(card?.title ? { role: card.title } : {}), ...(when ? { when } : {}) }];
      }
      const image = document.cover ?? card?.image;
      if (block.kind === "ProjectWall") {
        // The landed tile shows the card-size cover (oakRecordFacts.server.ts), so the plan tile loads that same file.
        const cover = card?.image ?? document.cover;
        const year = card?.period?.match(/\d{4}/g)?.at(-1);
        return [{ kind: "tile", documentId, title: card?.title ?? document.title.split(":")[0]!.trim(), ...(cover ? { image: cover, ratio: card?.imageRatio } : {}), ...(year ? { when: year } : {}) }];
      }
      const when = [card?.role, card?.period].filter(Boolean).join(" \u00b7 ");
      return [{ kind: "project", documentId, title: card?.title ?? document.title, ...(image ? { image, ratio: card?.imageRatio } : {}), ...(when ? { when } : {}) }];
    });
    if (drawn.length) cards.set(at, drawn);
  });
  return cards;
}

function OakPlanCard({ card }: { card: OakPlanRecordCard }) {
  if (card.kind === "tile") return <li className="oak-wall__tile" data-plan-card="">
    <div className="oak-wall__media" data-judge-ok={COVER_OK}>
      {card.image ? <OakArt className="oak-wall__cover oak-media-tile" src={card.image} alt="" ratio={card.ratio} /> : <span className="oak-wall__cover" data-empty="" />}
    </div>
    <div className="oak-wall__body">
      {card.when ? <p className="oak-wall__meta"><span className="oak-wall__year">{card.when}</span></p> : null}
      <h4 className="oak-wall__title">{card.title}</h4>
      <span aria-hidden="true"><SkelBar size="long" /><SkelBar /></span>
    </div>
  </li>;
  if (card.kind === "role") return <article className="oak-openui-card oak-openui-role" data-art={card.image ? "" : undefined} data-plan-card="">
    {card.image ? <OakArt className="oak-openui-role__art" src={card.image} alt="" ratio={card.ratio} />
      : <span className="oak-openui-role__tile" aria-hidden="true">{card.title.trim().charAt(0).toUpperCase()}</span>}
    <div className="oak-openui-role__body">
      <div className="oak-openui-role__head">
        <h4 className="oak-openui-card__title oak-openui-role__employer">{card.title}</h4>
        {card.when ? <p className="oak-openui-role__when">{card.when}</p> : null}
      </div>
      {card.role ? <ul className="oak-openui-chips oak-openui-role__titles" aria-label="Role">{oakRoleTitles(card.role).map(item => <li key={item} className="oak-openui-chip">{item}</li>)}</ul> : null}
      <span className="oak-openui-card__bars" aria-hidden="true"><span className="oak-openui-card__bar" data-long="" /><span className="oak-openui-card__bar" /></span>
    </div>
  </article>;
  return <article className="oak-openui-card oak-openui-project" data-plan-card="">
    <div className="oak-openui-card__head">
      {card.image ? <OakArt className="oak-openui-card__thumb" src={card.image} alt="" ratio={card.ratio} /> : null}
      <div className="oak-openui-card__name">
        <h4 className="oak-openui-card__title">{card.title}</h4>
        {card.when ? <p className="oak-openui-card__meta">{card.when}</p> : null}
      </div>
    </div>
    <span className="oak-openui-card__bars" aria-hidden="true"><span className="oak-openui-card__bar" data-long="" /><span className="oak-openui-card__bar" /></span>
  </article>;
}

/**
 * The ghost column with each open Project, Role or ProjectWall ghost that names records swapped for its record cards, in plan order. The
 * claim bars inside a card keep waiting for the arranged answer; a folding row stays a ghost so it eases out as before.
 */
export function OakPlanGhostColumn({ rows, cards }: { rows: readonly OakGhostRow[]; cards: ReadonlyMap<number, readonly OakPlanRecordCard[]> }) {
  const runs: React.ReactNode[] = [];
  let waiting: OakGhostRow[] = [];
  const flush = () => { if (waiting.length) runs.push(<OakGhostColumn key={`g${waiting[0]!.ghost.at}`} rows={waiting} />); waiting = []; };
  for (const row of rows) {
    const drawn = row.ghost.folding ? undefined : cards.get(row.ghost.at);
    if (!drawn) { waiting.push(row); continue; }
    flush();
    const shown = drawn.slice(Math.max(0, drawn.length - row.ghost.count)).map(card => <OakPlanCard key={card.documentId} card={card} />);
    runs.push(<div key={`c${row.ghost.at}`} className="oak-openui oak-openui-plan-cards" data-plan-cards={row.ghost.kind}>
      {row.ghost.kind === "ProjectWall" ? <div className="oak-wall" data-mode="wall"><ul className="oak-wall__grid">{shown}</ul></div> : shown}</div>);
  }
  flush();
  return <>{runs}</>;
}
