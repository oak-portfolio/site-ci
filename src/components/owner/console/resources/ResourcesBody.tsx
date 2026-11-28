import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { MeterBar } from '@/components/ui/meter';
import { Skeleton } from '@/components/ui/skeleton';
import { MachineFiles, readFailure } from './MachineFiles.tsx';
import type { FileRow, Part, ResourcesModel } from './model.ts';
import { httpsHref } from './parse.ts';
import './resources.css';

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function View<T>({ id, title, icon, file, part, onRetry, children }: { id: string; title: string; icon: IconName; file: string; part: Part<T>; onRetry: () => void; children: (data: T) => ReactNode }) {
  return <section className="oc-card rs__view" aria-labelledby={id}>
    <header className="oc-card__head">
      <h2 id={id} className="rs__title"><Icon name={icon} size={18} />{title}</h2>
      {part.state === 'ready' && part.stale ? <span className="rs__stale"><span className="oc-chip" data-tone="watch">Stale</span>
        <Button variant="secondary" size="sm" onClick={onRetry}><Icon name="retry" size={16} />Retry</Button></span> : null}
    </header>
    {part.state === 'loading' ? <div className="rs__wait"><Skeleton /><Skeleton /><Skeleton /></div>
      : part.state === 'failed' ? <div className="rs__failed">
        <p className="oc-note"><Icon name="offline" size={16} />{`${file} could not be read (${readFailure(part.reason, part.status)}).`}</p>
        <Button variant="secondary" size="sm" onClick={onRetry}><Icon name="retry" size={16} />Retry</Button>
      </div>
      : children(part.data)}
  </section>;
}

const Fact = ({ label, children }: { label: string; children: ReactNode }) => children === null || children === undefined || children === false ? null
  : <div className="rs__fact"><dt>{label}</dt><dd>{children}</dd></div>;
const Chips = ({ items, label, machine }: { items: string[]; label: string; machine?: boolean }) => items.length
  ? <ul className="rs__chips" aria-label={label}>{items.map(item => <li key={item} className={machine ? 'oc-key' : 'oc-chip'}>{item}</li>)}</ul> : null;

function FileFacts({ file }: { file: FileRow }) {
  if (file.state === 'loading') return <span className="rs__facts-wait"><Skeleton /></span>;
  if (file.state === 'failed') return <span className="oc-chip" data-tone="watch">Not read</span>;
  return <span className="rs__facts oc-muted">{file.size}, {count(file.lines ?? 0, 'line')}{file.stale ? ', stale' : ''}</span>;
}

function robotsVerdict(group: { verdict: 'open' | 'blocked'; rules: string[] }) {
  if (group.verdict === 'blocked') return { label: 'Blocked', tone: undefined, icon: 'cancel' as const };
  const closed = group.rules.flatMap(rule => /^Disallow (\S+)$/.exec(rule)?.[1] ?? []);
  return { label: closed.length ? `Open, except ${closed.join(', ')}` : 'Open', tone: 'ok', icon: 'checkmark' as const };
}

export function ResourcesBody({ model, onRetry }: { model: ResourcesModel; onRetry: () => void }) {
  const waiting = model.files.every(file => file.state === 'loading');
  const surfaces = model.files.filter(file => file.path !== '/robots.txt');
  return <div className="oc-stack rs">
    <div className="rs__bar">
      <p className="oc-muted" role="status">{waiting ? 'Reading the six public files.' : `Checked ${model.checked ?? 'just now'}. Each file is read as this dev server serves it.`}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}><Icon name="retry" size={16} />Read again</Button>
    </div>

    <section className="oc-card rs__view" aria-labelledby="rs-surfaces">
      <header className="oc-card__head"><h2 id="rs-surfaces" className="rs__title"><Icon name="machine" size={18} />What the site publishes for AI assistants</h2></header>
      <ul className="rs__files">{surfaces.map(file => <li key={file.path} className="rs__file">
        <span className="rs__icon"><Icon name={file.icon} size={18} /></span>
        <span className="rs__file-main"><a className="rs__link" href={file.path}>{file.label}</a><span className="oc-muted">{file.purpose}</span></span>
        <FileFacts file={file} />
      </li>)}</ul>
    </section>

    <div className="oc-grid oc-grid--2 rs__pair">
      <View id="rs-profile" title="profile.json" icon="identityFile" file="profile.json" part={model.profile} onRetry={onRetry}>{p =>
        <dl className="rs__facts-grid">
          <Fact label="Name">{p.name}</Fact>
          <Fact label="Also called">{p.alternateNames.length ? <Chips items={p.alternateNames} label="Also called" /> : null}</Fact>
          <Fact label="Title">{p.jobTitle}</Fact>
          <Fact label="Based in">{p.home}</Fact>
          <Fact label="Site">{p.url}</Fact>
          <Fact label="About">{p.description}</Fact>
          <Fact label="Knows about">{p.knowsAbout.length ? <Chips items={p.knowsAbout} label="Knows about" /> : null}</Fact>
          <Fact label="Profiles">{p.profiles.length ? <Chips items={p.profiles} label="Profiles" /> : null}</Fact>
          <Fact label="Articles listed">{p.articles}</Fact>
          <Fact label="Revision">{p.revision ? <code className="oc-key">{p.revision}</code> : null}</Fact>
        </dl>}
      </View>
      <View id="rs-skill" title="skill.md" icon="puzzle" file="skill.md" part={model.skill} onRetry={onRetry}>{s => <>
        {s.intro ? <p className="rs__lead">{s.intro}</p> : null}
        <dl className="rs__facts-grid">
          <Fact label="Canonical profile">{s.canonical ? <code className="oc-key">{s.canonical}</code> : null}</Fact>
          <Fact label="Actions">{s.actions.length ? <Chips items={s.actions} label="Supported actions" machine /> : null}</Fact>
        </dl>
        {s.fit.length ? <div><h3 className="rs__sub">Good fit</h3><ul className="rs__bullets">{s.fit.map(line => <li key={line}>{line}</li>)}</ul></div> : null}
        <div><h3 className="rs__sub">Sections</h3><ol className="rs__outline">{s.outline.map(item => <li key={item.title}><span>{item.title}</span>
          <span className="oc-muted">{item.items ? count(item.items, 'item') : 'text only'}</span></li>)}</ol></div>
      </>}</View>
    </div>

    <View id="rs-robots" title="Who may read the site" icon="crawlerPolicy" file="robots.txt" part={model.robots} onRetry={onRetry}>{r => <>
        {r.lead ? <p className="rs__lead">{r.lead}</p> : null}
        <ul className="rs__groups">{r.groups.map(group => { const verdict = robotsVerdict(group); return <li key={group.agent} className="rs__group">
          <span className="rs__agent">{group.agent === '*' ? 'Every other crawler' : group.agent}</span>
          <span className="oc-chip" data-tone={verdict.tone}><Icon name={verdict.icon} size={14} />{verdict.label}</span>
          <code className="rs__rules">{group.rules.join(', ')}</code>
        </li>; })}</ul>
        {r.sitemaps.map(map => httpsHref(map) ? <a key={map} className="rs__link" href={httpsHref(map)!} target="_blank" rel="noopener noreferrer"><Icon name="arrowUpRight" size={16} />Sitemap</a> : null)}
    </>}</View>

    <View id="rs-pages" title="Pages and how much is reviewed" icon="fileVerified" file="llms-full.txt" part={model.pages} onRetry={onRetry}>{pages => <>
        <p className="oc-muted">{count(pages.length, 'page')}, {count(pages.reduce((sum, page) => sum + page.facts, 0), 'fact')}, {pages.reduce((sum, page) => sum + page.sourced, 0)} with a source.</p>
        <ul className="rs__pages">{pages.map(page => <li key={page.title} className="rs__page">
          <span className="rs__page-head"><strong>{page.title}</strong>{page.route ? <code className="oc-key">{page.route}</code> : null}</span>
          {page.facts ? <>
            <span className="oc-meter" data-tone={page.sourced === page.facts ? 'ok' : 'watch'}><MeterBar value={page.sourced} max={page.facts} aria-label={`${page.title}: facts that name a source`} /></span>
            <span className="oc-muted">{`${page.sourced} of ${page.facts} facts name a source`}</span>
          </> : <span className="oc-muted">No facts listed</span>}
          <span className="oc-muted">{count(page.sections, 'section')}, {count(page.passages, 'passage')}</span>
        </li>)}</ul>
    </>}</View>

    <View id="rs-credentials" title="Certificates" icon="verified" file="llms-full.txt" part={model.credentials} onRetry={onRetry}>{items => items.length
      ? <ul className="rs__creds">{items.map(item => <li key={item.title} className="rs__cred">
        <span className="rs__cred-head"><strong>{item.title}</strong>{item.issuer ? <span className="oc-muted">{item.issuer}</span> : null}</span>
        <span className="oc-muted">{item.summary}</span>
        <span className="rs__cred-foot">
          {item.scopeNotes ? <span className="oc-chip">{count(item.scopeNotes, 'scope note')}</span> : null}
          {item.href ? <a className="rs__link" href={item.href} target="_blank" rel="noopener noreferrer"><Icon name="arrowUpRight" size={16} />Issuer record</a> : null}
        </span>
      </li>)}</ul>
      : <p className="oc-muted">No public credentials in llms-full.txt.</p>}
    </View>

    <section className="oc-card rs__view" aria-labelledby="rs-machine">
      <header className="oc-card__head"><h2 id="rs-machine" className="rs__title"><Icon name="dataFile" size={18} />Machine files</h2></header>
      <MachineFiles files={model.files} onRetry={onRetry} />
    </section>
  </div>;
}
