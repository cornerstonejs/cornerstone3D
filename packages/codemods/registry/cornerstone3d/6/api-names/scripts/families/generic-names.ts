import type { Rules, Run } from '../rules.ts';

/**
 * Generic names: every `Generic*` name of 6.0.0-beta.2 and its final name,
 * such as `GenericViewport` and `IGenericViewport` (lane N1).
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
