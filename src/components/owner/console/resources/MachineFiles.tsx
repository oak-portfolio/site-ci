import { useState } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/skeleton';
import type { FileRow } from './model.ts';
import type { ResourcePath } from './sources.ts';

const reasons = { network: 'no answer', type: 'wrong content type', status: 'unexpected status' } as const;
export const readFailure = (reason: keyof typeof reasons | 'parse', status: number | null) =>
  reason === 'status' && status ? String(status) : reason === 'parse' ? 'unreadable' : reasons[reason];

const topicLabel = (file: FileRow) => file.path === '/profile.json' ? 'Top-level keys' : file.path === '/robots.txt' ? 'Crawlers named' : 'Headings';
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Preview({ file, onRetry }: { file: FileRow; onRetry: () => void }) {
  if (file.state === 'loading') return <div className="rs__wait"><Skeleton /><Skeleton /><Skeleton /></div>;
  if (file.state === 'failed') return <div className="rs__failed">
    <p className="oc-note"><Icon name="offline" size={16} />{`${file.label} could not be read (${readFailure(file.reason ?? 'network', file.status)}).`}</p>
    <Button variant="secondary" size="sm" onClick={onRetry}><Icon name="retry" size={16} />Retry</Button>
  </div>;
  return <>
    <ul className="rs__chips" aria-label={`${file.label} at a glance`}>
      <li className="oc-chip">{file.format}</li><li className="oc-chip">{file.size}</li><li className="oc-chip">{count(file.lines ?? 0, 'line')}</li>
      {file.stale ? <li className="oc-chip" data-tone="watch">Stale</li> : null}
    </ul>
    {file.topics.length ? <p className="rs__topics"><span className="oc-muted">{topicLabel(file)}</span>{file.topics.map(topic => <span key={topic} className="oc-key">{topic}</span>)}</p> : null}
    <pre className="rs__code" tabIndex={0} aria-label={`${file.label}, first lines`}>{file.preview.join('\n')}</pre>
    <p className="oc-muted">Showing the first {file.preview.length} of {file.lines} lines, blank lines skipped.</p>
  </>;
}

export function MachineFiles({ files, onRetry }: { files: FileRow[]; onRetry: () => void }) {
  const [open, setOpen] = useState<ResourcePath>('/llms.txt');
  const file = files.find(candidate => candidate.path === open) ?? files[0]!;
  return <Tabs.Root value={file.path} onValueChange={value => setOpen(value as ResourcePath)} className="rs-files">
    <Tabs.List className="rs-tabs" aria-label="Public files" activateOnFocus>
      {files.map(candidate => <Tabs.Tab key={candidate.path} value={candidate.path} className="rs-tabs__tab" data-failed={candidate.state === 'failed' || undefined}>{candidate.label}</Tabs.Tab>)}
    </Tabs.List>
    <Tabs.Panel value={file.path} className="rs-files__panel">
      <div className="rs__file-head">
        <p className="oc-muted">{file.purpose}</p>
        <a className="rs__link" href={file.path} target="_blank" rel="noopener noreferrer"><Icon name="arrowUpRight" size={16} />Open as served</a>
      </div>
      <Preview file={file} onRetry={onRetry} />
    </Tabs.Panel>
  </Tabs.Root>;
}
