import snapshot from "../../data/generated/knowledgeSnapshot.json" with { type: "json" };

export const knowledgeSnapshot = snapshot;
export const knowledgeRevision = snapshot.revision;
export const knowledgeRevocationGeneration = "revocationGeneration" in snapshot ? Number(snapshot.revocationGeneration) : 0;
export const knowledgeCacheIdentity = `${knowledgeRevision}:revocations-${knowledgeRevocationGeneration}`;

export function resolveKnowledgePassage(id: string) {
  for (const document of snapshot.documents) {
    const passage = document.passages.find((entry) => entry.id === id);
    if (passage) return { document, passage, revision: snapshot.revision };
  }
  return undefined;
}

export function getKnowledgeDocument(id: string) {
  return snapshot.documents.find((document) => document.id === id);
}

export function renderKnowledgeExcerpts(documentId: string) {
  const document = getKnowledgeDocument(documentId);
  if (!document) return "";
  return ["## Steve Oak's authored source excerpts", "",
    "The following passages preserve Steve Oak's authored words as historical source evidence.", "",
    ...document.passages.flatMap((passage) => [passage.text.split("\n").map((line) => `> ${line}`).join("\n"), "",
      `[Read this section](${passage.citationUrl})`, ""])].join("\n");
}
