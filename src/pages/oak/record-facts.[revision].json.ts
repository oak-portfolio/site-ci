import type { APIRoute, GetStaticPaths } from "astro";
import { knowledgeRevision } from "@/lib/knowledge/snapshot";
import { oakRecordFacts } from "@/lib/oakRecordFacts.server";

export const getStaticPaths = (() => [{ params: { revision: knowledgeRevision } }]) satisfies GetStaticPaths;

export const GET = (async () => new Response(JSON.stringify(await oakRecordFacts()), {
  headers: { "Content-Type": "application/json; charset=utf-8" },
})) satisfies APIRoute;
