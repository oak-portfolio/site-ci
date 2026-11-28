import type { APIRoute } from "astro";
import { getProfileJsonFromContent } from "@/data/machineContent.server";

export const GET = (async () =>
  new Response(JSON.stringify(await getProfileJsonFromContent(), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  })) satisfies APIRoute;
