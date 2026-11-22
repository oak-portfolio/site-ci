import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");

const files = {
  component: resolve(repoRoot, "src/components/work/WorkGridLightbox.tsx"),
  route: resolve(repoRoot, "src/pages/work/[...slug].astro"),
  styles: resolve(repoRoot, "src/styles/global.css"),
};

const failures = [];

function readRequired(filePath, label) {
  if (!existsSync(filePath)) {
    failures.push(`${label} is missing: ${filePath}`);
    return "";
  }

  return readFileSync(filePath, "utf8");
}

function assertContains(source, needle, label) {
  if (!source.includes(needle)) {
    failures.push(`${label} must contain ${JSON.stringify(needle)}`);
  }
}

function assertMissing(source, needle, label) {
  if (source.includes(needle)) {
    failures.push(`${label} must not contain ${JSON.stringify(needle)}`);
  }
}

const component = readRequired(files.component, "WorkGridLightbox component");
const route = readRequired(files.route, "Work detail route");
const styles = readRequired(files.styles, "Global styles");

[
  "showModal",
  "useRef<HTMLDialogElement",
  "createRoot",
  "work-grid-lightbox-trigger",
  "aria-describedby",
  "onKeyDown",
  "ArrowLeft",
  "ArrowRight",
  "fullscreen",
  "arrowLeft",
  "arrowRight",
  "cancel",
  "addEventListener(\"click\"",
  "stopPropagation",
  "work-mdx-image-grid__media--interactive",
].forEach((needle) => assertContains(component, needle, "WorkGridLightbox component"));

assertMissing(component, "aria-haspopup", "WorkGridLightbox component");
assertMissing(component, "aria-labelledby", "WorkGridLightbox component");
assertMissing(component, "<h2", "WorkGridLightbox component");
assertContains(component, "aria-label={active?.group.label", "WorkGridLightbox component");

assertContains(route, 'import WorkGridLightbox from "@/components/work/WorkGridLightbox";', "Work detail route");
assertContains(route, "<WorkGridLightbox client:idle />", "Work detail route");

const contentPosition = route.indexOf("<Content components={workMdxComponents} />");
const lightboxPosition = route.indexOf("<WorkGridLightbox client:idle />");

if (contentPosition === -1 || lightboxPosition === -1 || lightboxPosition < contentPosition) {
  failures.push("WorkGridLightbox must be mounted after the Work MDX Content render.");
}

[
  ".work-grid-lightbox-trigger",
  ".work-grid-lightbox::backdrop",
  ".work-grid-lightbox__button--close",
  "grid-template-columns: 48px minmax(0, 1fr) 48px",
  "grid-column: 2",
  "grid-template-columns: 40px minmax(0, 1fr) 40px",
  ".work-mdx-image-grid__media--interactive:hover img",
  "width: 32px",
  "height: 32px",
  "@media (max-width: 760px)",
  ".work-mdx-image-grid__media::before",
  "--work-grid-bg",
].forEach((needle) => assertContains(styles, needle, "Global styles"));

if (failures.length > 0) {
  console.error("Work grid lightbox audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Work grid lightbox audit passed.");
