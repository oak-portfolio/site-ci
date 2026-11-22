import { proofSections } from "@/data/homePage";
import { OakArt } from "../../cards";
import type { SiteKindProps } from "./SiteView";
import { SiteFrame } from "./Frame";

export function SiteProof({ own, documentId }: SiteKindProps) {
  const [lead, ...rest] = proofSections;
  return <SiteFrame kind="proof" icon="socialProof" title="The standard Steve works to" from={{ href: "/#standard-heading", label: "From the home page" }} own={own} page={documentId}>
    <span data-anchor=""><OakArt className="oak-site__cover" src={lead.image} alt={lead.imageAlt} /></span>
    <ul className="oak-site__rows">{[lead, ...rest].map(section => <li key={section.title} className="oak-site__row">{section.title}</li>)}</ul>
  </SiteFrame>;
}
