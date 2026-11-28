import { digest } from './release-boundary.mjs';

export const emptyRevocations = () => ({generation:0, documents:[], passages:[], text:[]});
const normalized = text => text.replace(/\s+/g,' ').trim();
export function applyRevocations(snapshot, revocations) {
  const documents = snapshot.documents.filter(doc=>!revocations.documents.includes(doc.id)).map(doc=>({ ...doc,
    passages:doc.passages.filter(passage=>!revocations.passages.includes(passage.id) &&
      !revocations.text.some(text=>normalized(passage.text).includes(normalized(text))))
  })).filter(doc=>doc.passages.length).map(doc=>({...doc,attribution:{...doc.attribution,
    contributionPassageIds:doc.attribution.contributionPassageIds.filter(id=>doc.passages.some(p=>p.id===id))}}));
  const {revision,...original}=snapshot;
  const content={...original,documents,revocationGeneration:revocations.generation};
  return {...content,revision:`oak-${digest(content)}`};
}
export function nextRevocations(current,snapshot,kind,id) {
  const next=structuredClone(current);
  if(kind==='document') {
    const document=snapshot.documents.find(doc=>doc.id===id);
    if(!document) throw new Error('Unknown active public document');
    next.documents.push(id); next.text.push(...document.passages.map(p=>p.text));
  } else if(kind==='passage') {
    const passage=snapshot.documents.flatMap(doc=>doc.passages).find(p=>p.id===id);
    if(!passage) throw new Error('Unknown active public passage');
    next.passages.push(id); next.text.push(passage.text);
  } else throw new Error('Revoke requires document or passage');
  for(const key of ['documents','passages','text']) next[key]=[...new Set(next[key])].sort();
  next.generation++;
  return next;
}
export const knowledgeCacheIdentity = (revision,generation) => `${revision}:revocations-${generation}`;
