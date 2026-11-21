/** Drop query, hash and trailing slashes; the root stays "/". */
export function normalizePath(pathname: string) {
  const withoutQuery = pathname.split("?")[0]?.split("#")[0] || "/";
  if (withoutQuery === "/") return "/";
  return withoutQuery.replace(/\/+$/, "");
}

/** The Markdown mirror for a page that has one: home, Work and each Work case study. */
export function markdownApiHrefForPath(pathname: string) {
  const normalized = normalizePath(pathname);
  if (normalized === "/") return "/api/md";
  if (normalized === "/work") return "/api/md/work";
  if (normalized.startsWith("/work/")) return `/api/md/work/${normalized.split("/").pop()}`;
  return undefined;
}
