import type { APIRoute } from "astro";
import { renderRobotsTxt } from "@/data/machineContent.server";

export const GET = (() =>
  new Response(renderRobotsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  })) satisfies APIRoute;
