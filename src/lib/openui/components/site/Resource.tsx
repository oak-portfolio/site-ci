import { Icon } from "@/components/ui/Icon";
import { machineProfile } from "@/data/homePage";
import type { SiteKindProps } from "./SiteView";
import { SiteFrame, SiteLink } from "./Frame";

export function SiteResource({ own, documentId }: SiteKindProps) {
  return <SiteFrame kind="resource" icon="documentCode" title="Files for AI assistants" from={{ href: "/llms.txt", label: "From the site's AI files" }} own={own} page={documentId}>
    <ul className="oak-site__rows">{machineProfile.links.map(link => <li key={link.href}>
      <SiteLink to={link.href} className="oak-site__row"><span className="oak-site__icon" aria-hidden="true"><Icon name="dataFile" size={14} /></span>
        <span className="oak-site__label">{link.label}</span><span className="oak-site__path">{link.href}</span><Icon name="arrowRight" size={14} /></SiteLink></li>)}</ul>
  </SiteFrame>;
}
