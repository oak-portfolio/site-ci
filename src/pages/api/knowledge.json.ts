import type { APIRoute } from "astro";
import { knowledgeSnapshot } from "@/lib/knowledge/snapshot";

export const GET: APIRoute = () => new Response(JSON.stringify(knowledgeSnapshot), {
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" },
});
