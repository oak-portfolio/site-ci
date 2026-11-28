import type * as React from "react";
import siteOwners from "@/data/siteOwners.json";
import { ClaimList } from "../../cards";
import { useScope } from "../../scope";
import type { SiteCardProps } from "../SiteCard";
import { oakSiteItem, type OakSiteKind } from "./items";
import { SiteApp } from "./App";
import { SiteCareerRail } from "./CareerRail";
import { SiteProof } from "./Proof";
import { SiteResource } from "./Resource";
import { SiteSection } from "./Section";
import { SiteSocial } from "./Social";

export type SiteKindProps = { own: string[]; documentId: string };

const VIEWS: Partial<Record<OakSiteKind, React.ComponentType<SiteKindProps>>> = {
  app: SiteApp, resource: SiteResource, section: SiteSection, proof: SiteProof, social: SiteSocial, "career-rail": SiteCareerRail,
};

/** The card holds the claims citing its own item; a claim from any other page follows it as a plain point, so each claim shows once. */
export default function SiteView({ claims: ids, kind }: SiteCardProps) {
  const { claims } = useScope();
  const item = oakSiteItem(kind, siteOwners);
  const View = VIEWS[kind];
  const docOf = (id: string) => claims.get(id)?.citations[0]?.documentId ?? "";
  const own = item ? ids.filter(id => item.cites(docOf(id))) : [];
  if (!item || !View || !own.length) return <ClaimList ids={ids} />;
  return <>
    <View own={own} documentId={docOf(own[0]!)} />
    <ClaimList ids={ids.filter(id => !own.includes(id))} />
  </>;
}
