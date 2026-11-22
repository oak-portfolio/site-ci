import { careerTimelineItems } from "@/data/careerTimeline";
import type { SiteKindProps } from "./SiteView";
import { SiteFrame, SiteLink } from "./Frame";

export function SiteCareerRail({ own, documentId }: SiteKindProps) {
  return <SiteFrame kind="career-rail" icon="workHistory" title="Career" from={{ href: "/work", label: "From the career timeline" }} own={own} page={documentId}>
    <ol className="oak-site__rail">{careerTimelineItems.map((role, index) => <li key={role.id} className="oak-site__stop" data-current={index === 0 ? "" : undefined}>
      <span className="oak-site__marker" aria-hidden="true" />
      <SiteLink to={`/work#${role.id}`} className="oak-site__stop-link"><span className="oak-site__eyebrow">{role.label}</span><span className="oak-site__label">{role.title}</span><span className="oak-site__path">{role.place}</span></SiteLink>
    </li>)}</ol>
  </SiteFrame>;
}
