import { getBrandIconEntry, type BrandIconProviderKey } from "@/data/brandIconRegistry";

type KeywordBadgeProps = {
  children: string;
};

type BrandIconLinkProps = {
  label: string;
  provider: BrandIconProviderKey | string;
  href?: string;
};

function getProviderHref(provider: BrandIconProviderKey | string, href?: string) {
  return href || getBrandIconEntry(provider as BrandIconProviderKey)?.href;
}

export function KeywordBadge({ children }: KeywordBadgeProps) {
  return <span className="keyword-badge">{children}</span>;
}

export function BrandIconLink({ label, provider, href }: BrandIconLinkProps) {
  const entry = getBrandIconEntry(provider as BrandIconProviderKey);
  const targetHref = getProviderHref(provider, href);
  const shouldRenderIcon = entry?.iconMode === "favicon" && Boolean(entry.assetPath);

  if (!targetHref) {
    return <span className="brand-icon-link">{label}</span>;
  }

  return (
    <a
      className="brand-icon-link"
      href={targetHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} website (opens in a new tab)`}
    >
      {shouldRenderIcon ? (
        <img aria-hidden className="brand-icon-link__icon" src={entry.assetPath} alt="" decoding="async" loading="lazy" />
      ) : null}
      <span>{label}</span>
    </a>
  );
}

export const LobeIconLink = BrandIconLink;
