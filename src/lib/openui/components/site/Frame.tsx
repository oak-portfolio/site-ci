import type * as React from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { CardClaims } from "../../cards";
import { useScope } from "../../scope";

/** The island draws the link (Q17-G4: this library writes none); without its hook the row reads the same as plain text. */
export function SiteLink({ to, className, children }: { to: string; className: string; children: React.ReactNode }) {
  const { renderSiteLink } = useScope();
  return renderSiteLink ? <>{renderSiteLink({ href: to, className, children })}</> : <span className={className}>{children}</span>;
}

/** One top-level frame per kind (DESIGN.md "Answer cards"): a one-hue icon tile, the item's own title, its claims, then its rows. */
export function SiteFrame({ kind, icon, title, from, own, page, children }: {
  kind: string; icon: IconName; title: string; from: { href: string; label: string }; own: string[]; page: string; children: React.ReactNode;
}) {
  return <article className="oak-site oak-openui-card" data-kind={kind}>
    <div className="oak-site__head">
      <span className="oak-site__tile" aria-hidden="true"><Icon name={icon} size={20} /></span>
      <h4 className="oak-openui-card__title">{title}</h4>
    </div>
    <CardClaims ids={own} page={page} about={title} />
    {children}
    <SiteLink to={from.href} className="oak-site__from"><span>{from.label}</span><Icon name="arrowUpRight" size={14} /></SiteLink>
  </article>;
}
