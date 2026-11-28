import { Icon } from "@/components/ui/Icon";
import { featureCards } from "@/data/homePage";
import type { SiteKindProps } from "./SiteView";
import { SiteFrame } from "./Frame";

export function SiteSection({ own, documentId }: SiteKindProps) {
  return <SiteFrame kind="section" icon="sparkles" title="What drives Steve" from={{ href: "/#hero-title", label: "From the home page" }} own={own} page={documentId}>
    <ul className="oak-site__values" data-anchor="">{featureCards.map(card => <li key={card.title} className="oak-site__value">
      <span className="oak-site__art"><img src={card.image} alt="" loading="lazy" decoding="async" />
        <span className="oak-site__icon"><Icon name={card.icon} size={18} /></span></span>
      <span className="oak-site__label">{card.title}</span></li>)}</ul>
  </SiteFrame>;
}
