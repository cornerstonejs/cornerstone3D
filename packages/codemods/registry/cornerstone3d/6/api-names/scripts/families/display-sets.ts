import type { Rules, Run } from '../rules.ts';

/**
 * Display sets: the registry (`displaySetRegistry.add` in place of the beta
 * metadata provider), `displaySetId` in place of `dataId`, and the deleted
 * `kind` of a registered display set (lanes N2, DS1 to DS3).
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
