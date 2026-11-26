import { synchronizers } from '@cornerstonejs/tools';
import { synchronizers as appSynchronizers } from './app/synchronizers';

const local = {
  createStackImageSynchronizer: (id: string) => ({ id }),
};

export function setUp() {
  return [
    synchronizers.createImageSliceSynchronizer('slices'),
    appSynchronizers.createStackImageSynchronizer('app-slices'),
    local.createStackImageSynchronizer('local'),
    'createStackImageSynchronizer',
  ];
}
