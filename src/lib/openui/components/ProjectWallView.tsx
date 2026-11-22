import * as React from "react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { RadioGroup, RadioSegment } from "@/components/ui/radio-group";
import { legacyFramerCaseStudies } from "@/data/legacyWork";
import { oakRecordFactsState, useOakRecordFacts } from "@/lib/oakRecordFacts";
import type { AnswerClaim } from "../../../../packages/oak-agent-contracts/src/types";
import { oakOpenUIOwnWords } from "../../../../packages/oak-agent-contracts/src/openui/verdict";
import { oakProjectWallChips, oakProjectWallPath, oakProjectWallSorts, oakProjectWallView, type OakWallSort, type OakWallTile }
  from "../../../../packages/oak-agent-contracts/src/openui/views/project-wall";
import { announceOakBlock } from "../a11y/oakBlockAnnounce";
import { CardClaims, CardLink, ClaimList, OakArt, usePending } from "../cards";
import { useScope } from "../scope";
import { candidates, COVER_OK, GHOSTS, WallGhost, type ProjectWallProps } from "./ProjectWall";

type Tile = OakWallTile & { title: string; page: string; verified: boolean; cover?: { src: string; alt: string; ratio?: number };
  tint?: string; badge?: string; claims: string[] };

const TINT = /^#[0-9a-f]{3,8}$/i;
const bare = (url: string) => url.split("#")[0]!.replace(/\/$/, "");

function TileCard({ tile, reason, step, lead }: { tile: Tile; reason?: string; step?: number; lead?: boolean }) {
  const year = tile.date?.slice(0, 4);
  const badge = reason === tile.badge ? undefined : tile.badge;
  return <li className="oak-wall__tile" style={{ "--oak-wall-tint": tile.tint } as React.CSSProperties}>
    <div className="oak-wall__media" data-judge-ok={COVER_OK}>
      {tile.cover ? <OakArt className="oak-wall__cover oak-media-tile" src={tile.cover.src} alt={tile.cover.alt} ratio={tile.cover.ratio} />
        : <span className="oak-wall__cover" data-empty="" />}
      {lead ? <span className="oak-wall__start">Start here</span> : null}
      {badge ? <span className="oak-wall__badge">{badge}</span> : null}
    </div>
    <div className="oak-wall__body">
      {reason || year ? <p className="oak-wall__meta">
        {reason ? <span className="oak-wall__reason">{reason}</span> : null}
        {year ? <span className="oak-wall__year">{year}</span> : null}
      </p> : null}
      <h4 className="oak-wall__title">{step ? <span className="oak-wall__step">{step}</span> : null}
        <CardLink to={tile.page} verified={tile.verified}>{tile.title}</CardLink></h4>
      {tile.claims.length ? <CardClaims ids={tile.claims} page={tile.id} about={tile.title} /> : null}
    </div>
  </li>;
}

function Wall({ tiles, block }: { tiles: readonly Tile[]; block: string }) {
  const [chips, setChips] = React.useState<string[]>([]);
  const [sort, setSort] = React.useState<OakWallSort>("cited");
  const group = React.useRef<HTMLDivElement>(null);
  const options = tiles.length > 1 ? oakProjectWallChips(tiles) : [];
  const sorts = oakProjectWallSorts(tiles);
  const shown = oakProjectWallView(tiles, { chips, sort }) as Tile[];
  const change = (next: { chips?: string[]; sort?: OakWallSort }) => {
    const nextChips = next.chips ?? chips, nextSort = next.sort ?? sort;
    setChips(nextChips); setSort(nextSort);
    const count = oakProjectWallView(tiles, { chips: nextChips, sort: nextSort }).length;
    announceOakBlock(`${block}:wall`, `${count} of ${tiles.length} projects shown.`, { repeat: true });
  };
  const clear = () => { change({ chips: [] }); group.current?.querySelector<HTMLElement>("button")?.focus(); };
  return <>
    {options.length || sorts ? <div className="oak-wall__controls">
      {options.length ? <ToggleGroup ref={group} multiple value={chips} onValueChange={value => change({ chips: value as string[] })}
        aria-label="Filter projects" className="oak-wall__chips">
        {options.map(chip => <Toggle key={chip} value={chip} className="oak-wall__chip">{chip}</Toggle>)}
      </ToggleGroup> : null}
      {sorts ? <RadioGroup aria-label="Sort projects" value={sort} onValueChange={value => change({ sort: value === "recent" ? "recent" : "cited" })}>
        <RadioSegment value="cited">As cited</RadioSegment><RadioSegment value="recent">Recent</RadioSegment>
      </RadioGroup> : null}
    </div> : null}
    {shown.length ? <ul className="oak-wall__grid">{shown.map(tile => <TileCard key={tile.id} tile={tile} />)}</ul>
      : <div className="oak-wall__none"><p>No projects match {new Intl.ListFormat("en").format(chips)}.</p>
        <button type="button" className="oak-wall__clear" onClick={clear}>Clear filters</button></div>}
  </>;
}

export default function ProjectWallView({ claims: ids, mode = "wall", audience }: ProjectWallProps) {
  const { claims, cardOf, knowledgeRevision = "", id: block } = useScope();
  const list = ids.map(id => claims.get(id)).filter((claim): claim is AnswerClaim => Boolean(claim));
  const docs = candidates(list, mode);
  const firstWork = docs.find(doc => doc.id.startsWith("work:"))?.id ?? "";
  const first = useOakRecordFacts(firstWork, knowledgeRevision);
  const waiting = usePending(ids);
  if (waiting || (firstWork && first.status === "pending")) return <WallGhost count={Math.min(Math.max(docs.length, 2), GHOSTS)} />;
  const tiles: Tile[] = docs.flatMap((doc, order): Tile[] => {
    const source = cardOf?.({ ...doc.claim, citations: [doc.citation] }) ?? null;
    if (doc.id.startsWith("legacy-")) {
      const legacy = legacyFramerCaseStudies.find(item => bare(item.href) === bare(doc.citation.url));
      return legacy ? [{ id: doc.id, order, title: legacy.title, page: legacy.href, verified: source?.verified ?? false, stack: [], full: true,
        date: legacy.datePublished, badge: legacy.primaryTag, cover: { src: legacy.image, alt: legacy.imageAlt }, claims: [] }] : [];
    }
    const state = oakRecordFactsState(doc.id, knowledgeRevision);
    const title = source?.card?.title ?? source?.title.split(":")[0]!.trim();
    if (state.status !== "loaded" || state.facts.kind !== "work" || !title) return [];
    const facts = state.facts;
    return [{ id: doc.id, order, title, page: source!.page, verified: source!.verified, category: facts.category, stack: source?.card?.stack ?? [],
      date: facts.datePublished, full: facts.articleStatus === "full", badge: facts.statusLabel ?? facts.badge, cover: facts.cover,
      tint: TINT.test(facts.coverTint) ? facts.coverTint : undefined, claims: [] }];
  });
  if (!tiles.length) return <ClaimList ids={ids} />;
  // Each claim sits once: under the first tile it cites, else after the wall.
  const rest: string[] = [];
  for (const claim of list) {
    const tile = tiles.find(item => claim.citations.some(citation => citation.documentId === item.id));
    if (tile) tile.claims.push(claim.id); else rest.push(claim.id);
  }
  const own = mode === "path" ? oakOpenUIOwnWords(audience ?? "", 40) : null;
  return <><div className="oak-wall" data-mode={mode}>
    {mode === "path" ? <>
      {own ? <p className="oak-wall__caption">For {own}</p> : null}
      <ol className="oak-wall__grid">{(oakProjectWallPath(tiles) as Tile[]).map((tile, index) =>
        <TileCard key={tile.id} tile={tile} step={index + 1} lead={index === 0} reason={tile.category ?? tile.badge} />)}</ol>
    </> : mode === "legacy" ? <ul className="oak-wall__grid">{tiles.map(tile => <TileCard key={tile.id} tile={tile} />)}</ul>
      : <Wall tiles={tiles} block={block} />}
  </div><ClaimList ids={rest} /></>;
}
