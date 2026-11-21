import { featureCards, heroCopy, media, proofSections, workspaceRows } from "./homePage";

export type HomeElementKind = "portrait" | "heading" | "text" | "action" | "icon" | "image" | "interest";
export type HomeElement = { readonly id: string; readonly kind: HomeElementKind; readonly asset?: string; readonly label?: string };
export type HomeBlock = { readonly id: string; readonly elements: readonly HomeElement[] };
export type HomeSection = { readonly id: string; readonly blocks: readonly HomeBlock[] };

export const featureContextByTitle = {
  "Technology as a habit": "home.feature.technology",
  "Design since childhood": "home.feature.design",
  "Bay Area energy": "home.feature.bay-area",
} satisfies Record<(typeof featureCards)[number]["title"], string>;

export const proofContextByTitle = {
  "Agentic applied AI systems": "home.proof.agentic",
  "Design engineering for AI products": "home.proof.design",
} satisfies Record<(typeof proofSections)[number]["title"], string>;

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const hero: HomeBlock = {
  id: "home.hero",
  elements: [
    { id: "portrait", kind: "portrait", asset: media.welcomePortrait, label: "Steve Oak welcoming" },
    { id: "title", kind: "heading", label: heroCopy.title },
    { id: "description", kind: "text", label: heroCopy.description },
    { id: "say-hi", kind: "action", label: "Say Hi" },
  ],
};

const features: readonly HomeBlock[] = featureCards.map((card) => ({
  id: featureContextByTitle[card.title],
  elements: [
    { id: "icon", kind: "icon", asset: card.image, label: card.imageAlt },
    { id: "title", kind: "heading", label: card.title },
    { id: "description", kind: "text", label: card.description },
  ],
}));

const proofs: readonly HomeBlock[] = proofSections.map((section) => ({
  id: proofContextByTitle[section.title],
  elements: [
    { id: "title", kind: "heading", label: section.title },
    { id: "description", kind: "text", label: section.description },
    { id: "image", kind: "image", asset: section.image, label: section.imageAlt },
  ],
}));

const workspace: HomeBlock = {
  id: "home.workspace",
  elements: workspaceRows.flat().map((item) => ({ id: slug(item.label), kind: "interest", asset: item.image, label: item.label })),
};

export const homeRegistry = {
  page: { id: "home", path: "/" },
  sections: [
    { id: "home.hero", blocks: [hero, ...features] },
    { id: "home.proof", blocks: proofs },
    { id: "home.workspace", blocks: [workspace] },
  ],
} as const satisfies { page: { id: string; path: string }; sections: readonly HomeSection[] };

export const homeSectionIds = homeRegistry.sections.map((section) => section.id);
export const homeContexts = homeRegistry.sections.flatMap((section) => section.blocks.map((block) => block.id));
