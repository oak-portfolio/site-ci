import type { IconName } from '@/components/ui/Icon';

export const resourceSources = [
  { path: '/llms.txt', label: 'llms.txt', format: 'Plain text', type: 'text/plain', icon: 'machine', purpose: 'The short guide to the site' },
  { path: '/llms-full.txt', label: 'llms-full.txt', format: 'Plain text', type: 'text/plain', icon: 'dataFile', purpose: 'Every page in full, with sources' },
  { path: '/api/md', label: 'api/md', format: 'Markdown', type: 'text/markdown', icon: 'documentCode', purpose: 'One page as Markdown' },
  { path: '/profile.json', label: 'profile.json', format: 'JSON', type: 'application/json', icon: 'identityFile', purpose: 'Steve as structured data' },
  { path: '/skill.md', label: 'skill.md', format: 'Markdown', type: 'text/markdown', icon: 'puzzle', purpose: 'How an assistant should use the site' },
  { path: '/robots.txt', label: 'robots.txt', format: 'Plain text', type: 'text/plain', icon: 'crawlerPolicy', purpose: 'Who may read the site' },
] as const satisfies readonly { path: string; label: string; format: string; type: string; icon: IconName; purpose: string }[];

export type ResourcePath = (typeof resourceSources)[number]['path'];
export type ResourceSource = (typeof resourceSources)[number];

export const sourceOf = (path: ResourcePath): ResourceSource => resourceSources.find(source => source.path === path)!;
