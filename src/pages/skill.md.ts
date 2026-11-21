import type { APIRoute } from "astro";
import { renderSkillMarkdownFromContent } from "@/data/machineContent.server";

export const GET = (async () =>
  new Response(await renderSkillMarkdownFromContent(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  })) satisfies APIRoute;
