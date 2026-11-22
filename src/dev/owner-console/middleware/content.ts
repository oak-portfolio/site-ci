import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseJson, runFixed, type ReadOptions } from "./local.ts";

type Owner = { id: string; status: string; channels?: string[]; path?: string; paths?: string[]; directory?: string; outputs?: string[] };
type Status = { revision: string; contentIdentity?: string; approvedRevisions?: string[] };
type Item = { id: string; title: string; kind: string; status: string; channels: string[]; source: string; href: string | null };

export const path = "/__owner/local/content";
export const query = {};

const LIFECYCLE = "scripts/knowledge/lifecycle.mjs";

/** Where an item sits on the board, left to right: private draft, in review, approved but not shown, live on pages, live in answers only. */
export function column({ status, channels }: Pick<Item, "status" | "channels">) {
  if (status === "draft") return "draft";
  if (status !== "approved") return "review";
  if (!channels.length) return "approved";
  return channels.includes("page") ? "live" : "answers";
}
const visibility = (item: Item) => item.status !== "approved" ? "Draft" : item.channels.length ? "Public" : "Reviewed";

const field = (text: string, name: string) => text.match(new RegExp(`^${name}:\\s*"?([^"\\n]*)"?\\s*$`, "m"))?.[1];
function caseStudies(root: string) {
  const folder = join(root, "src/content/work");
  return readdirSync(folder).filter((file) => file.endsWith(".mdx")).sort().map((file) => {
    const head = readFileSync(join(folder, file), "utf8").split(/^---\s*$/m)[1] ?? "";
    const slug = file.slice(0, -4);
    return { slug, title: field(head, "projectName") ?? field(head, "title") ?? slug, draft: field(head, "draft") === "true" };
  });
}

/** The Site library as the lifecycle CLI's read-only `owners` and `status` commands see it. Nothing here writes. */
export function create({ root, spawn }: ReadOptions) {
  const node = <T,>(action: string) => runFixed(spawn, "node", [LIFECYCLE, action], { cwd: root, timeoutMs: 20_000 }).then((text) => parseJson<T>(text, "lifecycle"));
  return async () => {
    const [registry, status] = await Promise.all([node<{ owners: Owner[] }>("owners"), node<Status>("status")]);
    const owners: Item[] = registry.owners.map((owner) => ({ id: owner.id, title: owner.id, kind: "owner", status: owner.status, channels: owner.channels ?? [],
      source: owner.path ?? owner.directory ?? owner.paths?.[0] ?? "", href: owner.outputs?.[0] ?? null }));
    const work = owners.find((owner) => owner.id === "work") ?? { status: "held", channels: [] };
    const studies: Item[] = caseStudies(root).map(({ slug, title, draft }) => {
      const status = draft ? "draft" : work.status;
      return { id: `work:${slug}`, title, kind: "case study", status, channels: status === "approved" ? [...work.channels] : [],
        source: `src/content/work/${slug}.mdx`, href: `/work/${slug}` };
    });
    const items = [...owners, ...studies].map((item) => ({ ...item, column: column(item), visibility: visibility(item) }));
    return { revision: status.revision, contentIdentity: status.contentIdentity, approvedRevisions: status.approvedRevisions?.length ?? 0, items };
  };
}
