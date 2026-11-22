import type { APIRoute } from "astro";
import { getMachinePageByPath, renderMachinePageMarkdown } from "@/data/machineContent.server";

export const GET: APIRoute = async () => {
  const page = await getMachinePageByPath("/apps/kusala-daily/support");

  if (!page) {
    return new Response("Machine page not found.\n", { status: 404 });
  }

  return new Response(renderMachinePageMarkdown(page), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};
