type Cited = Readonly<{ citations: readonly Readonly<{ documentId: string; url?: string }>[] }>;

/** Table: one row per distinct record the claims cite, in citation order, keyed by `keyOf` (a record id or a page path; empty
 * skips the citation). Fewer than two rows is not a table, so the caller draws its degrade. */
export function oakOpenUITableView(claims: readonly (Cited | undefined)[], keyOf: (citation: Cited["citations"][number]) => string = citation => citation.documentId) {
  const keys: string[] = [];
  for (const claim of claims) for (const citation of claim?.citations ?? []) {
    const key = keyOf(citation);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return { rows: keys.length >= 2 ? keys : null };
}
