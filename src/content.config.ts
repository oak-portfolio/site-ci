import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const evidenceStatus = z.enum(["verified", "needs-oak", "do-not-publish"]);

const work = defineCollection({
  loader: glob({ base: "./src/content/work", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    projectName: z.string(),
    eyebrow: z.string(),
    dek: z.string(),
    description: z.string(),
    role: z.string(),
    timeline: z.string(),
    stack: z.array(z.string()),
    datePublished: z.coerce.date(),
    dateUpdated: z.coerce.date().optional(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(true),
    order: z.number().default(100),
    articleStatus: z.enum(["full", "in-progress-stub"]).default("full"),
    card: z.object({
      title: z.string(),
      category: z.string(),
      image: z.string(),
      imageAlt: z.string(),
      badge: z.string().optional(),
      statusLabel: z.string().optional(),
    }),
    hero: z.object({
      image: z.string(),
      imageAlt: z.string(),
      caption: z.string().optional(),
    }),
    social: z
      .object({
        image: z.string(),
        imageAlt: z.string(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      })
      .optional(),
    problem: z.object({
      summary: z.string(),
      stakes: z.array(z.string()),
    }),
    ownership: z.object({
      oak: z.array(z.string()),
      collaborators: z.array(z.string()),
      openQuestions: z.array(z.string()),
    }),
    systemMap: z.array(
      z.object({
        label: z.string(),
        description: z.string(),
      }),
    ),
    metrics: z.array(
      z.object({
        label: z.string(),
        value: z.string(),
        status: evidenceStatus,
        note: z.string(),
        kind: z.enum(["result", "context", "scope"]).optional(),
      }),
    ),
    evidenceStatus: z.object({
      publishMode: z.enum(["noindex-draft", "publish-ready"]),
      summary: z.string(),
      checks: z.array(z.string()),
    }),
    artifacts: z.array(
      z.object({
        label: z.string(),
        href: z.url().optional(),
        status: evidenceStatus,
        note: z.string(),
      }),
    ),
    jobMappings: z.array(
      z.object({
        roleFamily: z.string(),
        use: z.string(),
      }),
    ),
    tbdQueue: z.array(z.string()),
    seo: z.object({
      title: z.string(),
      description: z.string(),
      keywords: z.array(z.string()),
    }),
    schema: z.object({
      headline: z.string(),
      description: z.string(),
      about: z.array(z.string()),
    }),
    sources: z.array(
      z.object({
        label: z.string(),
        href: z.url(),
      }),
    ),
    machineSummary: z.string(),
    machineQuestions: z.array(
      z.object({
        heading: z.string(),
        answer: z.string(),
      }),
    ),
  }),
});

export const collections = { work };
