import { Icon } from '@/components/ui/Icon';
import { defineTab } from '../tab.ts';
import { CopyBar, createLocalStore, Empty, LocalState, type LocalRead } from '../local.tsx';

type Report = { file: string; wave: string; pass: boolean; at: number; capsules: { name: string; pass: boolean }[] };
type Body = { state: 'not-built' | 'ready'; report: Report | null; command: string };

const COMMAND = 'node scripts/quality/quality-bar.mjs --wave <name> --pairwise <pairwise.json> --out artifacts/quality-bar';
export const qualityStore = createLocalStore<Body>('/__owner/local/quality', { state: 'not-built', report: null, command: COMMAND });

type Model = { read: LocalRead<Body> };

function QualityView({ model }: { model: Model }) {
  const { read } = model;
  if (read.state !== 'ready') return <LocalState read={read} retry={qualityStore.reload} what="the quality bar report" />;
  const { report, command } = read.body;
  return <div className="oc-stack">
    <div className="oc-toolbar">
      <p className="oc-muted">Ticket 20's newest wave report from this machine. No sample readings.</p>
      <CopyBar label="Quality bar" json={model} command={command} />
    </div>
    {!report ? <Empty icon="target" title="Not built yet" detail={<>No wave report in <code>artifacts/quality-bar</code>. Run <code>{command}</code>.</>} />
      : <section className="oc-card" aria-labelledby="oc-quality">
        <header className="oc-card__head"><h2 id="oc-quality">Wave {report.wave}</h2>
          <span className="oc-chip" data-tone={report.pass ? 'ok' : 'danger'}><Icon name={report.pass ? 'checkmark' : 'alert'} size={14} />{report.pass ? 'Passes' : 'Fails'}</span></header>
        <p className="oc-muted"><code>{report.file}</code>, {new Date(report.at).toLocaleString()}</p>
        <ul className="oc-list">{report.capsules.map(capsule => <li key={capsule.name} className="oc-list__row">
          <span className="oc-list__label">{capsule.name}</span>
          <span className="oc-chip" data-tone={capsule.pass ? 'ok' : 'danger'}>{capsule.pass ? 'Pass' : 'Fail'}</span>
        </li>)}</ul>
      </section>}
  </div>;
}

export const qualityTab = defineTab<Model>({ id: 'quality', label: 'Quality bar', icon: 'target', reads: [], live: qualityStore,
  model: () => ({ read: qualityStore.getSnapshot() }), View: QualityView });
