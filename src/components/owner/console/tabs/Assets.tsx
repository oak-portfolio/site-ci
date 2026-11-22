import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/Icon';
import { defineTab } from '../tab.ts';
import { CopyBar, createLocalStore, Empty, LocalState, RecordsTable, type Column, type LocalRead, type Status } from '../local.tsx';

type Use = { use: string; alt: string; where: string };
type Asset = { id: string; src: string; kind: 'work' | 'brand'; focal: string; rights: string; uses: Use[]; usedIn: string[] };
type Body = { source: string[]; assets: Asset[] };

export const assetsStore = createLocalStore<Body>('/__owner/local/assets', { source: [], assets: [] });
const COMMAND = 'node scripts/assets/build-asset-record.mjs';

const reviewOf = (asset: Asset) => asset.uses.some(use => !use.alt.trim()) ? 'missing-alt' : asset.kind;
const statuses: Status[] = [{ id: 'work', label: 'Work images' }, { id: 'brand', label: 'Brand icons' }, { id: 'missing-alt', label: 'Missing alt', tone: 'danger' }];
const fileOf = (src: string) => src.split('/').pop() ?? src;
const shortWhere = (where: string) => where.replace(/^src\/content\/work\//, 'Work: ').replace(/^src\/data\//, '');

const columns: Column<Asset>[] = [
  { key: 'file', label: 'Image', head: true, sort: row => fileOf(row.src),
    cell: row => <span className="oc-asset"><img className="oc-thumb" src={row.src} alt="" loading="lazy" decoding="async" /><span className="oc-title">{fileOf(row.src)}<small>{row.kind === 'brand' ? 'Brand icon' : 'Work image'}</small></span></span> },
  { key: 'uses', label: 'Alt per use', sort: row => row.uses.length, cell: row => `${row.uses.length} ${row.uses.length === 1 ? 'use' : 'uses'}` },
  { key: 'usedIn', label: 'Used in', sort: row => row.usedIn[0] ?? '', cell: row => row.usedIn.map(shortWhere).join(', ') },
  { key: 'rights', label: 'Rights', sort: row => row.rights, cell: row => row.rights },
];

function Sheet({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  return <Dialog open={asset !== null} onOpenChange={open => { if (!open) onClose(); }}>
    {asset ? <DialogContent open aria-describedby={undefined}><div className="oc-sheet">
      <div className="oc-sheet__head">
        <DialogTitle render={<h2 />}>{fileOf(asset.src)}</DialogTitle>
        <DialogClose render={<Button variant="ghost" size="icon" aria-label="Close" title="Close" />}><Icon name="cancel" size={18} /></DialogClose>
      </div>
      <img className="oc-sheet__preview" src={asset.src} alt="" />
      <dl>
        <div><dt>Path</dt><dd><code>{asset.src}</code></dd></div>
        <div><dt>Focal point</dt><dd>{asset.focal === 'center' ? 'Center (not set)' : asset.focal}</dd></div>
        <div><dt>Rights</dt><dd>{asset.rights}</dd></div>
        <div><dt>Alt per use</dt><dd><ul className="oc-list">{asset.uses.map(use => <li key={`${use.use}-${use.where}-${use.alt}`} className="oc-list__row">
          <span className="oc-title"><span className="oc-chip">{use.use}</span><small>{shortWhere(use.where)}</small>{use.alt || <span className="oc-chip" data-tone="danger">Missing alt</span>}</span>
        </li>)}</ul></dd></div>
        <div><dt>Used in</dt><dd><ul className="oc-list">{asset.usedIn.map(where => <li key={where}><code>{where}</code></li>)}</ul></dd></div>
      </dl>
    </div></DialogContent> : null}
  </Dialog>;
}

type Model = { read: LocalRead<Body>; open: string | null };

function AssetsView({ model }: { model: Model }) {
  const [open, setOpen] = useState<string | null>(model.open);
  const { read } = model;
  if (read.state !== 'ready') return <LocalState read={read} retry={assetsStore.reload} what="the asset record" />;
  const { assets } = read.body;
  return <div className="oc-stack">
    <div className="oc-toolbar">
      <p className="oc-muted">{assets.length} images from Work MDX and the brand icon registry. Rebuild after adding one.</p>
      <CopyBar label="Assets" json={model} command={COMMAND} />
    </div>
    {!assets.length ? <Empty icon="scanImage" title="No assets on record" detail={<>Run <code>{COMMAND}</code> to build the record.</>} />
      : <RecordsTable label="Assets" rows={assets} columns={columns} statuses={statuses} statusOf={reviewOf} onOpen={row => setOpen(row.id)}
        actions={[{ label: 'Copy paths', icon: 'copy', command: ids => assets.filter(asset => ids.includes(asset.id)).map(asset => asset.src).join('\n') }]} />}
    <Sheet asset={assets.find(asset => asset.id === open) ?? null} onClose={() => setOpen(null)} />
  </div>;
}

const openParam = () => typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('asset');
export const assetsTab = defineTab<Model>({ id: 'assets', label: 'Assets', icon: 'scanImage', reads: [], live: assetsStore,
  model: () => ({ read: assetsStore.getSnapshot(), open: openParam() }), View: AssetsView });
