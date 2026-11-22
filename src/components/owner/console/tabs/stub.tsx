import type { IconName } from '@/components/ui/Icon';
import { defineTab } from '../tab.ts';
import { NotYet } from '../views.tsx';

type StubModel = { state: 'not-built'; arrivesWith: string; covers: string };

/** A tab whose real view lands in a later ticket; that ticket replaces only its own tabs/<Name>.tsx file. */
export const stubTab = (id: string, label: string, icon: IconName, arrivesWith: string, covers: string) => defineTab<StubModel>({ id, label, icon, reads: [],
  model: () => ({ state: 'not-built', arrivesWith, covers }),
  View: ({ model }) => <NotYet icon={icon} title="Not built yet" detail={`${model.covers} arrives with ${model.arrivesWith}.`} /> });
