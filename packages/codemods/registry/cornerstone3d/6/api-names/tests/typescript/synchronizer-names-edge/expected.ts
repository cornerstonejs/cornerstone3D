import { synchronizers as sync } from '@cornerstonejs/tools';
import type { Synchronizer } from '@cornerstonejs/tools';

const { createImageSliceSynchronizer: createSliceSync, createVOISynchronizer } =
  sync;
const factories = {
  slice: sync.createImageSliceSynchronizer,
  voi: createVOISynchronizer,
};

export function create(id: string): Synchronizer {
  const createStackImageSynchronizer = (name: string) => createSliceSync(name);

  return createStackImageSynchronizer(id) ?? factories.slice(`${id}-2`);
}

export const byKey = sync['createImageSliceSynchronizer'];
