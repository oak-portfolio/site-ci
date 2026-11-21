import tsParser from "@typescript-eslint/parser";
import astro from "eslint-plugin-astro";
import * as mdxParser from "eslint-mdx";
import shadcn from "@shadcn/lint";
import jsxA11y from "eslint-plugin-jsx-a11y-x";
import imports from "./scripts/design-policy/import-rule.mjs";
import runtimeStyle from "./scripts/design-policy/runtime-style-rule.mjs";
import { rawControl, agentBaseUiImport } from "./scripts/design-policy/agent-rule.mjs";
import { buttonCallerClasses, itemCallerClasses, overlayCallerClasses } from "./scripts/design-policy/policy.mjs";

const designRules = {
  "portfolio/import-boundary": "error",
  "portfolio/runtime-style": "error",
  "portfolio/raw-control": "error",
  "portfolio/agent-base-ui-import": "error",
  "shadcn/no-restyle": ["error", {
    allow: [...buttonCallerClasses, ...itemCallerClasses, ...overlayCallerClasses],
    ignoreImports: ["^@/components/ui/(?:Icon|badge|chart|tabs|tooltip)$"],
    componentImports: ["^@/components/ui/button$"],
    message: "Use {{component}} variants or approved caller classes. See DESIGN.md.",
  }],
};

export default [
  { ignores: ["node_modules/**", "dist/**", "artifacts/**", "graphify-out/**", ".astro/**"] },
  ...astro.configs.base,
  {
    files: ["src/**/*.{ts,tsx}", "tests/design-policy/fixtures/**/*.{ts,tsx}"],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  {
    files: ["**/*.astro"],
    languageOptions: { parserOptions: { parser: tsParser } },
  },
  {
    files: ["src/**/*.mdx", "tests/design-policy/fixtures/**/*.mdx"],
    languageOptions: { parser: mdxParser, parserOptions: { ignoreRemarkConfig: true } },
  },
  {
    files: ["src/**/*.{ts,tsx,astro,mdx}", "tests/design-policy/fixtures/**/*.{ts,tsx,astro,mdx}"],
    plugins: { portfolio: { rules: { "import-boundary": imports, "runtime-style": runtimeStyle, "raw-control": rawControl, "agent-base-ui-import": agentBaseUiImport } }, shadcn },
    settings: { shadcn: { ui: "@/components/ui", note: "See DESIGN.md and scripts/design-policy/policy.mjs." } },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "error" },
    rules: designRules,
  },
  // jsx-a11y recommended (the ESLint 10 maintained fork of eslint-plugin-jsx-a11y) on agent and ui components.
  {
    files: ["src/components/agent/**/*.tsx", "src/components/ui/**/*.tsx", "tests/design-policy/fixtures/**/*.tsx"],
    plugins: jsxA11y.configs.recommended.plugins,
    rules: jsxA11y.configs.recommended.rules,
  },
  // Implementations own their classes. Runtime and import checks stay active here.
  { files: ["src/components/ui/**/*.{ts,tsx}"], rules: { "shadcn/no-restyle": "off" } },
];
