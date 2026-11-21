import type { APIRoute, GetStaticPaths } from "astro";
import { getMachinePageBySlug, renderMachinePageMarkdown } from "@/data/machineContent.server";
import { getWorkEntries, getWorkSlug } from "@/lib/workContent";

export const getStaticPaths = (async () => {
  const entries = await getWorkEntries();
  return entries.map((entry) => ({
    params: { slug: getWorkSlug(entry) },
  }));
}) satisfies GetStaticPaths;

export const GET = (async ({ params }) => {
  const page = await getMachinePageBySlug(params.slug ?? "");

  if (!page) {
    return new Response("Machine page not found.\n", { status: 404 });
  }

  return new Response(renderMachinePageMarkdown(page), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}) satisfies APIRoute;
