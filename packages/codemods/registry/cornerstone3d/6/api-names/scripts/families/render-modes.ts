import type { Rules, Run } from '../rules.ts';

/**
 * Render modes: the render modes, `ActorRenderMode`, `ActorMapperProxy` and
 * `ActorEntry.actorMapper` that leave the public API, `getRenderPlan()`, the
 * slots of `registerRenderBackend` and `vtkCpuSlice` in place of
 * `vtkSampledSlice` (lane RM1).
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
