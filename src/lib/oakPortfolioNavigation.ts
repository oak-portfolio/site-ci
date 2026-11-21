import { oakPublicUrlSchema } from "../../packages/oak-agent-contracts/src/transport";

/** Site navigation follows the current host; citation evidence keeps its canonical URL. */
export function oakPortfolioNavigationHref(value: string): string | undefined {
  if (!oakPublicUrlSchema.safeParse(value).success) return undefined;
  const target = new URL(value, "https://steveoak.com");
  if (target.origin !== "https://steveoak.com") return value;

  // A double-slash path would become an external host if used as a relative href.
  if (target.pathname.startsWith("//")) return target.href;
  return `${target.pathname}${target.search}${target.hash}`;
}
