import type { APIRoute } from "astro";
import { renderLlmsFullTxtFromContent } from "@/data/machineContent.server";

export const GET = (async () =>
  new Response(await renderLlmsFullTxtFromContent(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  })) satisfies APIRoute;
