import type { MachinePage } from "@/data/machineContent";

export type MachinePageManifestEntry = {
  id: string;
  path: string;
  title: string;
  href: string;
};

export function getMachinePageEndpointSlug(page: Pick<MachinePage, "id" | "path">) {
  if (page.path === "/") return "index";
  if (page.path.startsWith("/work/")) return page.id;
  return page.path.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function getMachinePageEndpointSlugs(page: Pick<MachinePage, "id" | "path">) {
  const primarySlug = getMachinePageEndpointSlug(page);
  const pathSlug = page.path === "/" ? "index" : page.path.replace(/^\/+/, "").replace(/\/+$/, "");
  return Array.from(new Set([primarySlug, pathSlug]));
}

export function getMachinePageEndpoint(page: Pick<MachinePage, "id" | "path">) {
  return `/api/machine/${getMachinePageEndpointSlug(page)}.json`;
}

export function getMachinePageManifest(pages: MachinePage[]): MachinePageManifestEntry[] {
  return pages.map((page) => ({
    id: page.id,
    path: page.path,
    title: page.shortTitle,
    href: getMachinePageEndpoint(page),
  }));
}
