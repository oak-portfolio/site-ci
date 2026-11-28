export type EvidenceStatus = "verified" | "needs-oak" | "do-not-publish";
export type CaseStudyArticleStatus = "full" | "in-progress-stub";

export type CaseStudyMetric = {
  label: string;
  value: string;
  status: EvidenceStatus;
  note: string;
};

export type CaseStudyArtifact = {
  label: string;
  href?: string;
  status: EvidenceStatus;
  note: string;
};

export type CaseStudy = {
  slug: string;
  title: string;
  projectName: string;
  eyebrow: string;
  dek: string;
  description: string;
  role: string;
  timeline: string;
  stack: string[];
  datePublished: Date;
  dateUpdated?: Date;
  featured: boolean;
  draft: boolean;
  order: number;
  articleStatus: CaseStudyArticleStatus;
  card: {
    title: string;
    category: string;
    image: string;
    imageAlt: string;
    badge?: string;
    statusLabel?: string;
  };
  hero: {
    image: string;
    imageAlt: string;
    caption?: string;
  };
  social?: {
    image: string;
    imageAlt: string;
    width?: number;
    height?: number;
  };
  problem: {
    summary: string;
    stakes: string[];
  };
  ownership: {
    oak: string[];
    collaborators: string[];
    openQuestions: string[];
  };
  systemMap: {
    label: string;
    description: string;
  }[];
  metrics: CaseStudyMetric[];
  evidenceStatus: {
    publishMode: "noindex-draft" | "publish-ready";
    summary: string;
    checks: string[];
  };
  artifacts: CaseStudyArtifact[];
  jobMappings: {
    roleFamily: string;
    use: string;
  }[];
  tbdQueue: string[];
  seo: {
    title: string;
    description: string;
    keywords: string[];
  };
  schema: {
    headline: string;
    description: string;
    about: string[];
  };
  sources: {
    label: string;
    href: string;
  }[];
  machineSummary: string;
  machineQuestions: {
    heading: string;
    answer: string;
  }[];
};

export function isInProgressCaseStudy(caseStudy: Pick<CaseStudy, "articleStatus">) {
  return caseStudy.articleStatus === "in-progress-stub";
}

export function sortCaseStudiesByPublishedDateDesc<T extends Pick<CaseStudy, "datePublished" | "projectName">>(
  caseStudies: T[],
) {
  return [...caseStudies].sort((left, right) => {
    const dateDiff = right.datePublished.getTime() - left.datePublished.getTime();
    if (dateDiff !== 0) return dateDiff;
    return left.projectName.localeCompare(right.projectName);
  });
}
