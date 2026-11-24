import type { Rules, Run } from '../rules.ts';

/**
 * Events: the one appearance event in place of `VOI_MODIFIED` and
 * `COLORMAP_MODIFIED`, `DISPLAY_SETS_CHANGED`, `sliceIndex` in the detail of
 * `NEW_IMAGE`, and `SCROLL_OUT_OF_BOUNDS` in place of the three scroll
 * events (lanes EV1, EV2).
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
