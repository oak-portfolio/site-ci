export default {
  ignoreDisables: true,
  plugins: ["./scripts/design-policy/css-plugin.mjs"],
  ignoreFiles: ["node_modules/**", "dist/**", "artifacts/**", "graphify-out/**"],
  rules: {
    "property-no-unknown": true,
    "color-no-invalid-hex": true,
    "color-named": "never",
    "portfolio/token-contract": true,
    "portfolio/color-contract": true,
    "portfolio/agent-tokens": true,
  },
  overrides: [{ files: ["**/*.astro"], customSyntax: "postcss-html" }],
};
