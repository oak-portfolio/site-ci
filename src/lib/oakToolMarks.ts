import { brandIconRegistry, type BrandIconEntry } from "@/data/brandIconRegistry";

const fold = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Each bundled brand icon under the folded name of its key and its label ("Next.js" and "nextjs" both reach nextjs). */
const marks = new Map<string, string>();
for (const [key, entry] of Object.entries(brandIconRegistry) as [string, BrandIconEntry][]) {
  if (!entry.assetPath || entry.iconMode !== "favicon") continue;
  for (const name of [key, entry.label]) if (!marks.has(fold(name))) marks.set(fold(name), entry.assetPath);
}

/** Tool names that are another brand's product, keyed by folded name, pointing at the registry key whose mark they wear. */
const aliases: Record<string, string> = { vercelaisdk: "aisdk" };

/** The bundled brand mark of a stack tool, or null when the registry has none. Never a fetch to another site. */
export function oakToolMark(item: string) {
  const name = fold(item);
  return marks.get(name) ?? marks.get(aliases[name] ?? "") ?? null;
}
