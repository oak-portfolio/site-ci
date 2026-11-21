import {
  createMachinePages,
  getAgentProfileJson,
  getMachinePageByPath as findMachinePageByPath,
  getMachinePageBySlug as findMachinePageBySlug,
  getProfileJson,
  renderLlmsFullTxt,
  renderLlmsTxt,
  renderMachinePageMarkdown,
  renderRobotsTxt,
  renderSkillMarkdown,
} from "@/data/machineContent";
import { getCaseStudiesFromCollection } from "@/lib/workContent";
import candidates from "../../knowledge/external-candidates.json" with { type: "json" };
import contentOwners from "../../knowledge/owners.json" with { type: "json" };
import reviewLedger from "../../knowledge/review.json" with { type: "json" };
import { knowledgeSnapshot } from "@/lib/knowledge/snapshot";
import { projectPublicCredentialStatements } from "@/lib/knowledge/publicCredentialStatements.server";
import { createSiteLibrary, publicSiteLibrary } from "@/data/siteLibrary";

export { getProfileJson, renderMachinePageMarkdown, renderRobotsTxt };

export async function getMachinePages() {
  const caseStudies = await getCaseStudiesFromCollection();
  return createMachinePages(caseStudies);
}

export async function getMachinePageByPath(pathname: string) {
  const pages = await getMachinePages();
  return findMachinePageByPath(pages, pathname);
}

export async function getMachinePageBySlug(slug: string) {
  const pages = await getMachinePages();
  return findMachinePageBySlug(pages, slug);
}

export async function renderLlmsTxtFromContent() {
  const pages = await getMachinePages();
  return renderLlmsTxt(pages);
}

export async function renderLlmsFullTxtFromContent() {
  const pages = await getMachinePages();
  const credentials = projectPublicCredentialStatements({ candidates, reviewLedger, activeSnapshot: knowledgeSnapshot });
  return renderLlmsFullTxt(pages, credentials);
}

export async function getAgentProfileJsonFromContent() {
  const pages = await getMachinePages();
  return getAgentProfileJson(pages);
}

export async function getProfileJsonFromContent() {
  const pages = await getMachinePages();
  return getProfileJson(pages);
}

export async function renderSkillMarkdownFromContent() {
  const pages = await getMachinePages();
  return renderSkillMarkdown(pages);
}

export async function getSiteLibraryFromContent() {
  return createSiteLibrary(contentOwners.owners, await getCaseStudiesFromCollection());
}

export async function getPublicSiteLibraryFromContent() {
  return publicSiteLibrary(await getSiteLibraryFromContent());
}
