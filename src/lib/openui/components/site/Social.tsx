import { Icon, type IconName } from "@/components/ui/Icon";
import { socialLinks } from "@/data/homePage";
import type { SiteKindProps } from "./SiteView";
import { SiteFrame, SiteLink } from "./Frame";

const MARKS: Partial<Record<string, IconName>> = { x: "x", youtube: "youtube", instagram: "instagram", linkedin: "linkedin", github: "github" };

export function SiteSocial({ own, documentId }: SiteKindProps) {
  return <SiteFrame kind="social" icon="globe" title="Where else to find Steve" from={{ href: "/#hero-title", label: "From the home page" }} own={own} page={documentId}>
    <ul className="oak-site__social">{socialLinks.map(link => <li key={link.href}>
      <SiteLink to={link.href} className="oak-site__chip"><Icon name={MARKS[link.icon] ?? "globe"} size={16} /><span>{link.label}</span></SiteLink></li>)}</ul>
  </SiteFrame>;
}
