import { oakCitationLabel, type OakCitationLabels } from "@/lib/oakCitationLabels";
import { Icon } from "@/components/ui/Icon";
import { PreviewCard, PreviewCardContent, PreviewCardTrigger } from "@/components/ui/preview-card";
import { oakMeaningIcons, oakSourceLabels, oakSourceMeaning } from "@/lib/oakMeaningIcons";
import type { PublicCitation } from "../../../packages/oak-agent-contracts/src/types";
import type { OakMeaning } from "@/lib/oakMeaningIcons";
import { OakSprite, type OakActivitySpritePose } from "./OakActivitySprite";

/** Each portfolio source type's sprite, shown only where one source stands alone. */
export const oakSourceArt: Partial<Record<OakMeaning, OakActivitySpritePose>> = {
  "source.case-study": "source-case-study", "source.experience": "source-profile", "source.profile": "source-profile",
  "source.resource": "source-resource", "source.article": "source-article",
};
const sourceArt = oakSourceArt;

/**
 * Every public source list in the transcript: one numbered pill per distinct URL, next to the claim it supports. The link is the 44px target; the pill inside is the visual; hover or focus previews the source.
 * `order` is the whole answer's source documents by first appearance, so a page keeps one number across claims and matches Copy with sources.
 */
export function OakCitations({ citations, knowledgeRevision, citationLabels, label, order, landmark = true }: {
  citations: readonly PublicCitation[]; knowledgeRevision: string; citationLabels?: OakCitationLabels; label: string; order?: readonly string[];
  /** False where the list repeats links shown elsewhere (the reasoning trail), so it adds no navigation landmark. */
  landmark?: boolean;
}) {
  const unique = Array.from(new Map(citations.map(citation => [citation.documentId, citation])).values());
  const List = landmark ? "nav" : "div";
  return (
    <List className="oak-message__sources" aria-label={label} role={landmark ? undefined : "group"}>
      {unique.map((citation, index) => {
        const number = order?.includes(citation.documentId) ? order.indexOf(citation.documentId) + 1 : index + 1;
        const title = oakCitationLabel(citation, knowledgeRevision, citationLabels, `Source ${number}`);
        const meaning = oakSourceMeaning(citation);
        const where = URL.canParse(citation.url) ? new URL(citation.url) : null;
        return <PreviewCard key={citation.url}>
          <PreviewCardTrigger href={citation.url}>
            <span className="oak-message__source" data-source-number={number} data-source-type={meaning.replace("source.", "")}><Icon name={oakMeaningIcons[meaning]} size={14} /><span className="oak-message__source-title">{title}</span></span>
          </PreviewCardTrigger>
          <PreviewCardContent className="oak-source-preview">
            {sourceArt[meaning] ? <OakSprite pose={sourceArt[meaning]} className="oak-source-preview__art" /> : null}
            <p className="oak-source-preview__type"><Icon name={oakMeaningIcons[meaning]} size={14} /><span>{oakSourceLabels[meaning]}</span><span>Source {number}</span></p>
            <p className="oak-source-preview__title">{title}</p>
            {where ? <p className="oak-source-preview__url">{where.host}{where.pathname.replace(/\/$/, "")}</p> : null}
          </PreviewCardContent>
        </PreviewCard>;
      })}
    </List>
  );
}
