/** A parsed block as the OpenUI runtime hands it to a renderer. Tests write it as a literal. */
export type OakOpenUINode = Readonly<{ typeName?: string; props?: Readonly<Record<string, unknown>> }> | null | undefined;

/** What the answer knows about one claim: its text, the document its first citation names, and that page's card (route and
 * short name) when the labels match the answer's revision. */
export type OakClaimFacts = (id: string) => Readonly<{ text: string; document: string; card?: Readonly<{ page: string; name: string }> }> | undefined;

export const prop = (node: OakOpenUINode, name: string) => node?.props?.[name];
export const claimOf = (node: OakOpenUINode) => { const id = prop(node, 'claim'); return typeof id === 'string' ? id : ''; };
