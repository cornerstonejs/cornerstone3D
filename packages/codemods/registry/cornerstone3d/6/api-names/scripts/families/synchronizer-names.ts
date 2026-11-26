import type { Rules } from '../rules.ts';

const TOOLS_PACKAGE = '@cornerstonejs/tools';

/**
 * Synchronizer names of the tools package that 6.0 removes:
 * `synchronizers.createStackImageSynchronizer`, the alias that 5.x kept of
 * `createImageSliceSynchronizer` (the same function under a second name).
 * Each use, and each import of the name, takes the final name.
 */
export const rules: Rules = {
  exports: [
    {
      package: TOOLS_PACKAGE,
      namespace: 'synchronizers',
      name: 'createStackImageSynchronizer',
      to: 'createImageSliceSynchronizer',
    },
  ],
  members: [],
  keys: [],
};
