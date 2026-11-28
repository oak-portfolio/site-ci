import * as React from "react";

export type OakExcerpts = Readonly<{ knowledgeRevision: string; passages: Readonly<Record<string, string>> }>;

let cache: OakExcerpts | null = null;
let pending: Promise<OakExcerpts | null> | null = null;

/** Tests and the state gallery seed the cache; the live site fills it from /oak/excerpts.json on first need. */
export function primeOakExcerpts(value: OakExcerpts | null) { cache = value; pending = null; }

function loadOakExcerpts(): Promise<OakExcerpts | null> {
  if (cache) return Promise.resolve(cache);
  return pending ??= fetch("/oak/excerpts.json", { credentials: "omit" })
    .then(response => response.ok ? response.json() as Promise<OakExcerpts> : null)
    .then(value => (cache = value))
    .catch(() => { pending = null; return null; });
}

/** A cited passage's excerpt, only when it comes from the same knowledge revision as the answer. Loads once, when `active`. */
export function useOakExcerpt(passageId: string, knowledgeRevision: string, active = true): string | null {
  const [excerpts, setExcerpts] = React.useState(cache);
  React.useEffect(() => {
    if (!active || excerpts) return;
    let live = true;
    void loadOakExcerpts().then(value => { if (live) setExcerpts(value); });
    return () => { live = false; };
  }, [active, excerpts]);
  return excerpts?.knowledgeRevision === knowledgeRevision ? excerpts.passages[passageId] ?? null : null;
}
