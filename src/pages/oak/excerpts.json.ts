import type { APIRoute } from "astro";
import { knowledgeRevision, knowledgeSnapshot } from "@/lib/knowledge/snapshot";

// Q05: a short public excerpt per cited passage for the chip popover and Sources sheet. Fetched lazily from this
// origin on first open, so pages do not inline 119 KB of passage text. The passages are already public (llms-full.txt).
const ROOM = 180;
const excerpt = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= ROOM) return flat;
  const end = flat.lastIndexOf(" ", ROOM);
  return `${flat.slice(0, end > ROOM / 2 ? end : ROOM).replace(/[\s,;:.]+$/, "")}…`;
};

export const GET = (() => new Response(JSON.stringify({
  knowledgeRevision,
  passages: Object.fromEntries(knowledgeSnapshot.documents.flatMap(document => document.passages.map(passage => [passage.id, excerpt(passage.text)]))),
}), { headers: { "Content-Type": "application/json; charset=utf-8" } })) satisfies APIRoute;
