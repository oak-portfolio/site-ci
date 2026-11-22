import type { APIRoute } from "astro";
import { renderLlmsTxtFromContent } from "@/data/machineContent.server";

export const GET = (async () =>
  new Response(await renderLlmsTxtFromContent(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  })) satisfies APIRoute;
