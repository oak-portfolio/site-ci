import type { APIRoute } from "astro";
import { getAgentProfileJsonFromContent } from "@/data/machineContent.server";

export const GET = (async () =>
  new Response(JSON.stringify(await getAgentProfileJsonFromContent(), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  })) satisfies APIRoute;
