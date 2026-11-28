import { fingerprint } from './corpus.mjs';
import { publicSiteLibrary } from '../../src/data/siteLibrary.ts';

export function createPublicSnapshot(inventory, sourceIdentity) {
  const documents = inventory.eligibleDocuments.map((document) => ({
    id: document.id, kind: document.kind, title: document.title, canonicalUrl: document.canonicalUrl,
    dates: { published: document.dates.published, updated: document.dates.updated, period: document.dates.period },
    attribution: { author: document.ownership.author, subject: document.ownership.subject, role: document.ownership.role,
      collaborators: [...document.ownership.publicCollaborators],
      qualifiers: [...document.ownership.publicQualifiers],
      contributionPassageIds: document.passages.filter((passage) => document.ownership.contributions.includes(passage.text)).map((passage) => passage.id) },
    evidenceScope: 'historical-source',
    passages: document.passages.map((passage) => ({ id: passage.id, sectionId: passage.sectionId, kind: passage.kind,
      text: passage.text, headingPath: [...passage.headingPath], citationUrl: passage.citationUrl })),
  }));
  const content = { schema: 'oak.public-knowledge.v2', sourceIdentity, policyIdentity: inventory.policyFingerprint,
    policyVersion: inventory.policyVersion, documents, ...(inventory.library ? { library: publicSiteLibrary(inventory.library) } : {}) };
  return { ...content, revision: `oak-${fingerprint(content)}` };
}
