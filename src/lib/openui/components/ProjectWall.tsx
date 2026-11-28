import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { oakProjectWallOn } from "@/lib/oakFlags/projectWall";
import type { AnswerClaim } from "../../../../packages/oak-agent-contracts/src/types";
import { oakLinkedCaseStudy } from "../../../../packages/oak-agent-contracts/src/openui/plan";
import { oakLazyView } from "../figure/oakLazyView";
import { claimId, SkelBar, useScope } from "../scope";
import { Project } from "./Project";

export type Mode = "wall" | "path" | "legacy";
export type ProjectWallProps = { claims: string[]; mode?: Mode; audience?: string };

export const GHOSTS = 6;
const workSlug = (id: string) => id.replace(/^work:/, "");

/** The documents a tile may stand for: cited ones, plus the case study a reviewed career entry links to (the unlock rule). */
export function candidates(claims: readonly AnswerClaim[], mode: Mode) {
  const docs: { id: string; claim: AnswerClaim; citation: AnswerClaim["citations"][number]; linked: boolean }[] = [];
  const add = (id: string, claim: AnswerClaim, citation: AnswerClaim["citations"][number], linked: boolean) => {
    if (!docs.some(doc => doc.id === id)) docs.push({ id, claim, citation, linked });
  };
  for (const claim of claims) for (const citation of claim.citations) {
    const id = citation.documentId;
    if (mode === "legacy") { if (id.startsWith("legacy-")) add(id, claim, citation, false); continue; }
    if (id.startsWith("work:")) add(id, claim, citation, false);
    const linked = id.startsWith("experience:") ? oakLinkedCaseStudy(id) : null;
    if (linked) add(linked, claim, { ...citation, documentId: linked, url: `https://steveoak.com/work/${workSlug(linked)}/` }, true);
  }
  return docs;
}

// DESIGN.md "Answer cards": a card's cover is inset and takes the card radius less that inset, so it is media, not a nested card.
export const COVER_OK = "card-in-card: the cover is the tile's inset media";

export function WallGhost({ count }: { count: number }) {
  return <div className="oak-wall oak-openui-skel" data-pending="" aria-hidden="true"><ul className="oak-wall__grid">
    {Array.from({ length: count }, (_, index) => <li key={index} className="oak-wall__tile" data-ghost="">
      <span className="oak-wall__cover" data-judge-ok={COVER_OK} /><span className="oak-wall__body"><SkelBar size="chip" /><SkelBar size="long" /><SkelBar /></span></li>)}
  </ul></div>;
}

function WallPending({ claims: ids, mode = "wall" }: ProjectWallProps) {
  const { claims } = useScope();
  const list = ids.flatMap(id => claims.get(id) ?? []);
  return <WallGhost count={Math.min(Math.max(candidates(list, mode).length, 2), GHOSTS)} />;
}

const Off = ({ claims }: ProjectWallProps) => <>{Project.component({ props: { claims } } as never)}</>;
const Lazy = oakLazyView<ProjectWallProps>(() => import("./ProjectWallView"), WallPending, Off);
const ProjectWallBlock = ({ claims, mode, audience }: ProjectWallProps) =>
  oakProjectWallOn() ? <Lazy claims={claims} mode={mode} audience={audience} /> : <Off claims={claims} />;

export const ProjectWall = defineComponent({
  name: "ProjectWall",
  description: "For an overview of Steve's work (what has he built or made, show me his AI work, where to start): two or more of his projects as cover tiles, every claim about them in this one block, never a card per project. Mode wall (default; visitors filter and sort), path (a reading order for the audience named) or legacy (his older work). Never for how one project works or which tools he used.",
  props: z.object({ claims: z.array(claimId), mode: z.enum(["wall", "path", "legacy"]).optional(), audience: z.string().optional() }),
  component: ({ props }) => <ProjectWallBlock claims={props.claims} mode={props.mode} audience={props.audience} />,
});
