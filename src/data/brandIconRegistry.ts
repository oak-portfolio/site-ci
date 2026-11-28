export type BrandIconMode = "favicon" | "none";

export type BrandIconProviderKey =
  | "android"
  | "astro"
  | "cloudflare"
  | "apple"
  | "aws"
  | "browseruse"
  | "calrecycle"
  | "chatgpt"
  | "claude"
  | "claudecode"
  | "codex"
  | "clerk"
  | "convex"
  | "cursor"
  | "discord"
  | "expo"
  | "fastapi"
  | "factory"
  | "figma"
  | "gemini"
  | "github"
  | "google"
  | "hermes"
  | "imessage"
  | "linkedin"
  | "lovable"
  | "motion"
  | "nextjs"
  | "openclaw"
  | "openai"
  | "openrouter"
  | "perplexity"
  | "playwright"
  | "reactnative"
  | "remotion"
  | "revenuecat"
  | "slack"
  | "stagehand"
  | "superwall"
  | "mintlify"
  | "postiz"
  | "telegram"
  | "tiktok"
  | "youtube"
  | "v0"
  | "aisdk"
  | "betterauth"
  | "capacitor"
  | "deepgram"
  | "exa"
  | "googlecloud"
  | "instagram"
  | "langsmith"
  | "mcp"
  | "notion"
  | "obsidian"
  | "posthog"
  | "prisma"
  | "python"
  | "reddit"
  | "resend"
  | "sentry"
  | "supabase"
  | "telegrambotapi"
  | "tremendous"
  | "typescript"
  | "x"
  | "vercel";

export type BrandIconEntry = {
  label: string;
  href: string;
  domain: string;
  iconMode: BrandIconMode;
  assetPath?: string;
  preferredIconUrl?: string;
  notes?: string;
};

export const brandIconRegistry = {
  android: {
    label: "Android",
    href: "https://developer.android.com",
    domain: "developer.android.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/android.png",
  },
  apple: {
    label: "Apple",
    href: "https://developer.apple.com",
    domain: "developer.apple.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/apple.png",
  },
  aws: {
    label: "AWS",
    href: "https://aws.amazon.com",
    domain: "aws.amazon.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/aws.png",
  },
  browseruse: {
    label: "browser-use",
    href: "https://browser-use.com",
    domain: "browser-use.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/browseruse.png",
  },
  calrecycle: {
    label: "CalRecycle",
    href: "https://calrecycle.ca.gov/",
    domain: "calrecycle.ca.gov",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/calrecycle.png",
  },
  chatgpt: {
    label: "ChatGPT",
    href: "https://chatgpt.com",
    domain: "openai.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/chatgpt.png",
    notes: "Uses the OpenAI favicon source because chatgpt.com blocks direct favicon refresh requests.",
  },
  claude: {
    label: "Claude",
    href: "https://claude.ai",
    domain: "claude.ai",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/claude.png",
  },
  claudecode: {
    label: "Claude Code",
    href: "https://www.anthropic.com/claude-code",
    domain: "www.anthropic.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/claudecode.png",
  },
  codex: {
    label: "Codex",
    href: "https://openai.com/codex/",
    domain: "openai.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/codex.png",
  },
  clerk: {
    label: "Clerk",
    href: "https://clerk.com",
    domain: "clerk.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/clerk.png",
  },
  convex: {
    label: "Convex",
    href: "https://www.convex.dev",
    domain: "www.convex.dev",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/convex.png",
  },
  cursor: {
    label: "Cursor",
    href: "https://www.cursor.com",
    domain: "www.cursor.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/cursor.png",
  },
  discord: {
    label: "Discord",
    href: "https://discord.com",
    domain: "discord.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/discord.png",
  },
  expo: {
    label: "Expo",
    href: "https://expo.dev",
    domain: "expo.dev",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/expo.png",
  },
  fastapi: {
    label: "FastAPI",
    href: "https://fastapi.tiangolo.com/",
    domain: "fastapi.tiangolo.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/fastapi.png",
  },
  factory: {
    label: "Factory",
    href: "https://factory.ai",
    domain: "factory.ai",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/factory.png",
  },
  figma: {
    label: "Figma",
    href: "https://www.figma.com/",
    domain: "www.figma.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/figma.png",
  },
  gemini: {
    label: "Gemini",
    href: "https://gemini.google.com/",
    domain: "gemini.google.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/gemini.png",
  },
  github: {
    label: "GitHub",
    href: "https://github.com",
    domain: "github.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/github.png",
  },
  google: {
    label: "Google",
    href: "https://google.com",
    domain: "google.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/google.png",
  },
  hermes: {
    label: "Hermes",
    href: "https://hermes-agent.nousresearch.com/",
    domain: "hermes-agent.nousresearch.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/hermes.png",
    preferredIconUrl: "https://hermes-agent.nousresearch.com/icon.png?icon.17972d59.png",
    notes: "Uses the Hermes Agent app icon instead of the larger site favicon.ico, which is not the desired inline mark.",
  },
  imessage: {
    label: "iMessage",
    href: "https://www.apple.com/ios/messages/",
    domain: "www.apple.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/imessage.png",
  },
  linkedin: {
    label: "LinkedIn",
    href: "https://www.linkedin.com/",
    domain: "www.linkedin.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/linkedin.png",
  },
  lovable: {
    label: "Lovable",
    href: "https://lovable.dev/",
    domain: "lovable.dev",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/lovable.png",
  },
  motion: {
    label: "Motion",
    href: "https://motion.dev/",
    domain: "motion.dev",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/motion.png",
  },
  mintlify: {
    label: "Mintlify",
    href: "https://www.mintlify.com",
    domain: "www.mintlify.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/mintlify.png",
  },
  nextjs: {
    label: "Next.js",
    href: "https://nextjs.org/",
    domain: "nextjs.org",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/nextjs.png",
  },
  openclaw: {
    label: "OpenClaw",
    href: "https://openclaw.ai/",
    domain: "openclaw.ai",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/openclaw.png",
  },
  openai: {
    label: "OpenAI",
    href: "https://openai.com",
    domain: "openai.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/openai.png",
  },
  openrouter: {
    label: "OpenRouter",
    href: "https://openrouter.ai",
    domain: "openrouter.ai",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/openrouter.png",
  },
  perplexity: {
    label: "Perplexity",
    href: "https://www.perplexity.ai/",
    domain: "www.perplexity.ai",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/perplexity.png",
  },
  playwright: {
    label: "Playwright",
    href: "https://playwright.dev",
    domain: "playwright.dev",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/playwright.png",
  },
  reactnative: {
    label: "React Native",
    href: "https://reactnative.dev/",
    domain: "reactnative.dev",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/reactnative.png",
  },
  remotion: {
    label: "Remotion",
    href: "https://www.remotion.dev",
    domain: "www.remotion.dev",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/remotion.png",
  },
  revenuecat: {
    label: "RevenueCat",
    href: "https://www.revenuecat.com",
    domain: "www.revenuecat.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/revenuecat.png",
  },
  slack: {
    label: "Slack",
    href: "https://slack.com",
    domain: "slack.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/slack.png",
  },
  stagehand: {
    label: "Stagehand",
    href: "https://www.browserbase.com/stagehand",
    domain: "www.browserbase.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/stagehand.png",
  },
  superwall: {
    label: "Superwall",
    href: "https://superwall.com",
    domain: "superwall.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/superwall.png",
  },
  postiz: {
    label: "Postiz",
    href: "https://postiz.com",
    domain: "postiz.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/postiz.png",
  },
  telegram: {
    label: "Telegram",
    href: "https://telegram.org",
    domain: "telegram.org",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/telegram.png",
  },
  tiktok: {
    label: "TikTok",
    href: "https://www.tiktok.com/business",
    domain: "www.tiktok.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/tiktok.png",
  },
  youtube: {
    label: "YouTube",
    href: "https://www.youtube.com/",
    domain: "www.youtube.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/youtube.png",
    preferredIconUrl: "https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png",
  },
  v0: {
    label: "v0",
    href: "https://v0.dev",
    domain: "v0.dev",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/v0.png",
  },
  astro: {
    label: "Astro",
    href: "https://docs.astro.build",
    domain: "astro.build",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/astro.png",
  },
  cloudflare: {
    label: "Cloudflare",
    href: "https://developers.cloudflare.com",
    domain: "cloudflare.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/cloudflare.png",
  },
  vercel: {
    label: "Vercel",
    href: "https://sdk.vercel.ai",
    domain: "sdk.vercel.ai",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/vercel.png",
  },
  aisdk: {
    label: "AI SDK",
    href: "https://ai-sdk.dev",
    domain: "ai-sdk.dev",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/aisdk.png",
  },
  betterauth: {
    label: "BetterAuth",
    href: "https://better-auth.com",
    domain: "better-auth.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/betterauth.png",
  },
  capacitor: {
    label: "Capacitor",
    href: "https://capacitorjs.com",
    domain: "capacitorjs.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/capacitor.png",
  },
  deepgram: {
    label: "Deepgram",
    href: "https://deepgram.com",
    domain: "deepgram.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/deepgram.png",
  },
  exa: {
    label: "Exa",
    href: "https://exa.ai",
    domain: "exa.ai",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/exa.png",
  },
  googlecloud: {
    label: "Google Cloud",
    href: "https://cloud.google.com",
    domain: "cloud.google.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/googlecloud.png",
  },
  instagram: {
    label: "Instagram",
    href: "https://instagram.com",
    domain: "instagram.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/instagram.png",
  },
  langsmith: {
    label: "LangSmith",
    href: "https://smith.langchain.com",
    domain: "smith.langchain.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/langsmith.png",
  },
  mcp: {
    label: "Model Context Protocol",
    href: "https://modelcontextprotocol.io",
    domain: "modelcontextprotocol.io",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/mcp.png",
  },
  notion: {
    label: "Notion",
    href: "https://notion.com",
    domain: "notion.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/notion.png",
  },
  obsidian: {
    label: "Obsidian",
    href: "https://obsidian.md",
    domain: "obsidian.md",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/obsidian.png",
  },
  posthog: {
    label: "PostHog",
    href: "https://posthog.com",
    domain: "posthog.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/posthog.png",
  },
  prisma: {
    label: "Prisma",
    href: "https://prisma.io",
    domain: "prisma.io",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/prisma.png",
  },
  python: {
    label: "Python",
    href: "https://python.org",
    domain: "python.org",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/python.png",
  },
  reddit: {
    label: "Reddit",
    href: "https://reddit.com",
    domain: "reddit.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/reddit.png",
  },
  resend: {
    label: "Resend",
    href: "https://resend.com",
    domain: "resend.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/resend.png",
  },
  sentry: {
    label: "Sentry",
    href: "https://sentry.io",
    domain: "sentry.io",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/sentry.png",
  },
  supabase: {
    label: "Supabase",
    href: "https://supabase.com",
    domain: "supabase.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/supabase.png",
  },
  telegrambotapi: {
    label: "Telegram Bot API",
    href: "https://core.telegram.org",
    domain: "core.telegram.org",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/telegrambotapi.png",
  },
  tremendous: {
    label: "Tremendous",
    href: "https://tremendous.com",
    domain: "tremendous.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/tremendous.png",
  },
  typescript: {
    label: "TypeScript",
    href: "https://typescriptlang.org",
    domain: "typescriptlang.org",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/typescript.png",
  },
  x: {
    label: "X",
    href: "https://x.com",
    domain: "x.com",
    iconMode: "favicon",
    assetPath: "/assets/brand-icons/x.png",
  },
} satisfies Record<BrandIconProviderKey, BrandIconEntry>;

export function getBrandIconEntry(provider: BrandIconProviderKey): BrandIconEntry {
  return brandIconRegistry[provider];
}
