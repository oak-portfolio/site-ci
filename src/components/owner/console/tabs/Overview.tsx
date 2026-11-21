import { Icon, type IconName } from '@/components/ui/Icon';
import { dataOf, type Reads } from '../reads.ts';
import { defineTab, tabHref } from '../tab.ts';
import { keysModel } from './Keys.tsx';
import { usageModel } from './Usage.tsx';
import { healthModel } from './Health.tsx';

type Insight = { id: string; icon: IconName; label: string; value: string; detail: string; tone?: 'ok' | 'watch' | 'danger'; tab: string };

function overviewModel(reads: Reads): { insights: Insight[] } {
  const keys = dataOf(reads.keys) && keysModel(dataOf(reads.keys), dataOf(reads.grants));
  const usage = dataOf(reads.usage) && usageModel(dataOf(reads.usage), 'loading');
  const health = dataOf(reads.services) && healthModel(dataOf(reads.services), 'loading');
  const attention = keys ? keys.providers.filter(p => p.state !== 'healthy').length : null;
  const troubled = health ? health.services.filter(s => !['ready', 'disabled'].includes(s.condition)).length : null;
  const grants = dataOf(reads.grants);
  return { insights: [
    { id: 'keys', icon: 'key', label: 'Keys', tab: 'keys', value: keys ? `${keys.providers.filter(p => p.active).length} active` : 'Unknown',
      detail: attention === null ? 'Key queue unavailable' : attention ? `${attention} need attention` : 'Every provider has a spare', tone: attention ? 'watch' : attention === 0 ? 'ok' : undefined },
    { id: 'spend', icon: 'balanceScale', label: 'Spend this month', tab: 'usage', value: usage ? usage.actual : 'Unknown',
      detail: usage ? `of ${usage.ceiling}, ${usage.held} held` : 'Month totals unavailable', tone: usage?.shares && usage.shares.actual + usage.shares.held >= 80 ? 'watch' : usage ? 'ok' : undefined },
    { id: 'health', icon: 'securityCheck', label: 'Services', tab: 'health', value: health ? troubled ? `${troubled} to check` : 'All clear' : 'Unknown',
      detail: health?.generations ? `${health.generations.used} of ${health.generations.limit} generations retained` : 'Service read unavailable', tone: troubled ? 'watch' : troubled === 0 ? 'ok' : undefined },
    { id: 'grants', icon: 'gift', label: 'Grant codes', tab: 'keys', value: grants ? `${grants.filter(g => g.status === 'active').length} active` : 'Unknown',
      detail: grants ? `${grants.filter(g => g.status === 'redeemed').length} redeemed` : 'Grant list unavailable' },
  ] };
}
type Model = ReturnType<typeof overviewModel>;

function OverviewView({ model }: { model: Model }) {
  return <ul className="oc-grid oc-grid--4 oc-insights" aria-label="Insights">
    {model.insights.map(card => <li key={card.id} className="oc-tile oc-insight" data-tone={card.tone}>
      <a href={tabHref(card.tab)} className="oc-insight__link">
        <span className="oc-insight__icon"><Icon name={card.icon} size={18} /></span>
        <span className="oc-insight__label">{card.label}</span>
        <strong className="oc-insight__value">{card.value}</strong>
        <span className="oc-muted">{card.detail}</span>
      </a>
    </li>)}
  </ul>;
}

export const overviewTab = defineTab({ id: 'overview', label: 'Overview', icon: 'compass', reads: ['keys', 'grants', 'usage', 'services'], model: overviewModel, View: OverviewView });
