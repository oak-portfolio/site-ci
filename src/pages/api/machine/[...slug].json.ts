import type { APIRoute, GetStaticPaths } from "astro";
import type { MachinePage } from "@/data/machineContent";
import { getMachinePages } from "@/data/machineContent.server";
import { getMachinePageEndpointSlugs } from "@/lib/machinePageManifest";

export const getStaticPaths = (async () => {
  const pages = await getMachinePages();
  return pages.flatMap((page) =>
    getMachinePageEndpointSlugs(page).map((slug) => ({
      params: { slug },
      props: { page },
    })),
  );
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ page: MachinePage }> = ({ props }) =>
  new Response(JSON.stringify(props.page), {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
