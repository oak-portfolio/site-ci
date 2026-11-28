import { mergeStatements, parseExpression, split, tokenize } from "@openuidev/lang-core";
import { oakRecordQueryOn } from "@/lib/oakFlags/recordQuery";
import { loadOakRecordFacts, oakRecordFactsState } from "@/lib/oakRecordFacts";
import { oakPublishable } from "@/lib/oakPublishable";

/** The tool name a program passes to Query; its only argument is the record's `documentId`. */
export const OAK_RECORD_TOOL = "oak_record";

type Row = Readonly<Record<string, unknown>>;

const WORK_TEXT = ["dek", "category", "badge", "statusLabel", "period"] as const;
const EXPERIENCE_TEXT = ["engagement", "dateStart", "dateEnd", "title"] as const;
const APP_TEXT = ["name", "path", "privacy"] as const;
const LISTS = ["systemMap", "artifacts", "metrics", "facts", "pages", "knowsAbout"] as const;

/** Ticket 342: the line a block shows when its record cannot be read: unknown, held, unloadable or the constant off. */
export const OAK_RECORD_EMPTY_LINE = "Record details unavailable";

/** What a Query settles to with no record: the empty line in every public text field and no rows, so a block never shows model words. */
export function oakRecordEmpty() {
  return {
    ...Object.fromEntries([...WORK_TEXT, ...EXPERIENCE_TEXT, ...APP_TEXT].map(key => [key, OAK_RECORD_EMPTY_LINE])),
    ...Object.fromEntries(LISTS.map(key => [key, []])),
  };
}

const text = (value: unknown) => typeof value === "string" && value.trim() ? value : undefined;
const verified = (item: unknown): item is Row => Boolean(item) && typeof item === "object" &&
  (!("status" in (item as Row)) || oakPublishable(item as Parameters<typeof oakPublishable>[0]));

function rows(value: unknown, keys: readonly string[]) {
  if (!Array.isArray(value)) return [];
  return value.filter(verified).flatMap(item => {
    const row: Record<string, string> = {};
    for (const key of keys) { const shown = text(item[key]); if (shown) row[key] = shown; }
    return text(item[keys[0]]) ? [row] : [];
  });
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => Boolean(text(item))) : [];
}

function pick(fact: Row, keys: readonly string[]) {
  const out: Record<string, string> = {};
  for (const key of keys) { const shown = text(fact[key]); if (shown) out[key] = shown; }
  return out;
}

function ownership(value: unknown) {
  const lines = value as { oak?: unknown; collaborators?: unknown } | undefined;
  const oak = strings(lines?.oak);
  return oak.length ? { ownership: { oak, collaborators: strings(lines?.collaborators) } } : {};
}

/** A record's public facts: named fields only, verified rows only, and nothing at all for a held record. */
export function oakRecordPublicFacts(documentId: string, fact: unknown) {
  if (!verified(fact)) return null;
  const record = fact as Row;
  switch (record.kind) {
    case "work": return { documentId, kind: "work", ...pick(record, WORK_TEXT),
      systemMap: rows(record.systemMap, ["label", "description"]), artifacts: rows(record.artifacts, ["label"]),
      metrics: rows(record.metrics, ["label", "value"]), ...ownership(record.ownership) };
    case "experience": return { documentId, kind: "experience", ...pick(record, EXPERIENCE_TEXT) };
    case "app": return { documentId, kind: "app", ...pick(record, APP_TEXT), facts: strings(record.facts), pages: rows(record.pages, ["label", "href"]) };
    case "profile": return { documentId, kind: "profile", knowsAbout: strings(record.knowsAbout) };
    default: return null;
  }
}

async function resolve(knowledgeRevision: string, args: Record<string, unknown>) {
  const documentId = typeof args?.documentId === "string" ? args.documentId : null;
  if (!oakRecordQueryOn() || !documentId) return null;
  await loadOakRecordFacts(knowledgeRevision);
  const state = oakRecordFactsState(documentId, knowledgeRevision);
  return state.status === "loaded" ? oakRecordPublicFacts(documentId, state.facts) : null;
}

/**
 * Ticket 72: the Renderer's tool provider for one answer's knowledge revision. It reads only that revision's record-facts
 * asset, never the Worker or a model, and always settles (ticket 342: to the empty record when the record is unknown, held
 * or unloadable), so a Query's model-written defaults show only while it loads.
 */
export function oakRecordToolProvider(knowledgeRevision: string) {
  return {
    [OAK_RECORD_TOOL]: (args: Record<string, unknown>): Promise<unknown> =>
      resolve(knowledgeRevision, args).catch(() => null).then(facts => facts ?? oakRecordEmpty()),
  };
}

/**
 * Ticket 342 (r72 N1): with the constant off the Renderer gets no provider, so a Query would show its model-written defaults
 * as settled words forever. Off, each Query statement becomes the empty record; a program with no Query comes back unchanged.
 */
export function oakRecordQueryOff(program: string) {
  if (oakRecordQueryOn() || !program.includes("Query(")) return program;
  const queries = split(tokenize(program)).flatMap(statement => {
    const ast = parseExpression(statement.tokens);
    return ast.k === "Comp" && ast.name === "Query" ? [statement.id] : [];
  });
  const empty = JSON.stringify(oakRecordEmpty());
  return queries.length ? mergeStatements(program, queries.map(id => `${id} = ${empty}`).join("\n")) : program;
}
