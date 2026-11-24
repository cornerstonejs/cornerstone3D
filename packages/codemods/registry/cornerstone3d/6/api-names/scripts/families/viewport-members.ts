import type { Rules, Run } from '../rules.ts';

/**
 * Viewport members and queries: `getVolumeIds()`, `getScalarRange`,
 * `getDisplaySetIdForVolumeId`, `isInAcquisitionPlane()` and the
 * `geometry3d` content mode (lane RM2).
 */
export const rules: Rules = {
  exports: [],
  members: [],
  keys: [],
};

/**
 * The rewrites of this family that no table entry says. They run before the
 * tables of every family; a site they rewrite or report is marked handled
 * (`run.handled`), and the tables leave it.
 */
export function rewrite(_run: Run): void {}
