import { defineTab } from '../tab.ts';
import { buildModel, type ResourcesModel } from '../resources/model.ts';
import { ResourcesBody } from '../resources/ResourcesBody.tsx';
import { resourceStore } from '../resources/store.ts';

export const publicResourcesTab = defineTab<ResourcesModel>({ id: 'public', label: 'Public resources', icon: 'globe', reads: [],
  model: () => buildModel(resourceStore.getSnapshot()), live: resourceStore,
  View: ({ model }) => <ResourcesBody model={model} onRetry={resourceStore.reload} /> });
