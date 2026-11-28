import type { DocumentAnswerFields, DocumentCoverage, DocumentRequirementSource, PrivateDocumentCitation } from './document-answer.ts';
export type OakVersions = Readonly<{
  characterVersion: string;
  hardPolicyVersion: string;
  knowledgeRevision: string;
}>;

export type OakOperation = 'read' | 'search' | 'navigate' | 'draft';
export type OwnerContactTopic =
  | 'steve-pricing'
  | 'steve-rates'
  | 'steve-compensation'
  | 'steve-availability'
  | 'steve-start-date';

export type OakTask =
  | Readonly<{ kind: 'question'; text: string; contactPreference?: 'open' | 'declined' }>
  | OakInlineRoleFitTask
  | OakDocumentRoleFitTask
  | Readonly<{ kind: 'advice'; text: string; contactPreference: 'open' | 'declined' }>
  | Readonly<{ kind: 'contact'; topics: readonly OwnerContactTopic[]; text: string }>
  | Readonly<{ kind: 'decline'; text: string }>
  | Readonly<{ kind: 'correction'; text: string; priorAnswer: string }>;
export type OakInlineRoleFitTask = Readonly<{ kind: 'role-fit'; text: string; roleDescription: string; requirementSource?: never }>;
export type OakDocumentRoleFitTask = Readonly<{ kind: 'role-fit'; text: string; requirementSource: DocumentRequirementSource; roleDescription?: never }>;

export type PublicCitation = Readonly<{
  documentId: string;
  passageId: string;
  sectionId: string;
  url: string;
}>;

export type AnswerClaim = Readonly<{
  id: string;
  text: string;
  citations: readonly PublicCitation[];
}>;

/** Requirement text belongs to the visitor's role, never Steve's public facts. */
export type RoleFitRow = Readonly<{
  id: string;
  requirement: Readonly<{ text: string; start: number; end: number; source?: PrivateDocumentCitation }>;
  status: 'demonstrated' | 'transferable' | 'missing-evidence';
  evidence: readonly AnswerClaim[];
  gap: string | null;
  questions: readonly string[];
}>;

type OutputIdentity = OakVersions & Readonly<{
  schema: 'oak.answer.v1';
  speaker: 'oak-ai-host';
  operations: readonly OakOperation[];
}>;

/** Conditional suggestions for the visitor, separate from public Steve facts. */
export type AdviceProposal = Readonly<{
  recommendation: string;
  assumptions: readonly string[];
  tradeoffs: readonly string[];
  nextStep: string;
}>;

/** The one tool the app suggests after a work answer; absent when no tool fits. */
export type OakNextTool = 'role' | 'advice' | 'brief';

export type OakAnswer = OutputIdentity & (
  | (Readonly<{ kind: 'document' }> & DocumentAnswerFields)
  | Readonly<{ kind: 'sourced' | 'gap'; claims: readonly AnswerClaim[]; acknowledgment: string | null; nextTool?: OakNextTool }>
  /** A narrowing question with 2 to 4 plain options; it makes no claim about Steve. */
  | Readonly<{ kind: 'clarify'; question: string; options: readonly string[] }>
  /** App-authored: the visitor asked Oak to send something; the client owns all copy and nothing is sent. */
  | Readonly<{ kind: 'proposal'; action: 'contact-brief' }>
  | Readonly<{ kind: 'role-fit'; rows: readonly RoleFitRow[]; contactTopics: readonly OwnerContactTopic[]; coverage?: DocumentCoverage }>
  | Readonly<{ kind: 'advice'; scope: 'supported-expertise' | 'limited-evidence'; proposal: AdviceProposal;
      evidence: readonly AnswerClaim[]; uncertainty: string; contactOffer: boolean }>
  /** `reason` is absent for a topic only Steve answers (rates, pay, dates) and 'contact' when the visitor asked how to reach him. */
  | Readonly<{ kind: 'contact'; control: 'Say Hi'; offerDraft: boolean; reason?: 'contact' }>
  | Readonly<{ kind: 'declined'; acknowledgment: string }>
);
export type OakRoleFitAnswer = Extract<OakAnswer, { kind: 'role-fit' }>;
export type OakDocumentAnswer = Extract<OakAnswer, { kind: 'document' }>;
export type OakAdviceAnswer = Extract<OakAnswer, { kind: 'advice' }>;

export type SourceSupport =
  | Readonly<{ kind: 'excerpt'; passageId: string; quote: string }>
  | Readonly<{ kind: 'metadata'; documentId: string; field: 'period' | 'published'; value: string }>;

export type ReviewedClaim = AnswerClaim & Readonly<{
  support: readonly SourceSupport[];
  review: string;
}>;

export type OakFixture = Readonly<{
  id: string;
  input: Readonly<{
    turns: readonly Readonly<{ role: 'visitor' | 'oak'; text: string }>[];
    untrustedSourceText: string | null;
    contactTopics: readonly OwnerContactTopic[];
  }>;
  expected: OakAnswer;
  reviewedClaims: readonly ReviewedClaim[];
  forbiddenText: readonly string[];
  factualReview: string;
}>;

export type PublicEvidenceSnapshot = Readonly<{
  revision: string;
  documents: readonly Readonly<{
    id: string;
    dates: Readonly<{ period: string | null; published: string | null }>;
    passages: readonly Readonly<{
      id: string;
      text: string;
      sectionId: string;
      citationUrl: string;
    }>[];
  }>[];
}>;

export type FixtureFinding = Readonly<{
  lane: 'identity' | 'authority' | 'citation' | 'source-support' | 'factual';
  message: string;
}>;
