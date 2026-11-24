import { mergeRules } from '../rules.ts';
import type { Rules, Run } from '../rules.ts';

/**
 * Appearance: the look of a display set, `DisplaySetAppearance` in place of
 * the presentation (`setDisplaySetAppearance`, `getDisplaySetAppearance`,
 * `resetDisplaySetAppearance`, `getEffectiveDisplaySetAppearance`) and one
 * `opacity` in place of `colormap.opacity` (lanes N3, AP1, AP2).
 */
const appearance: Rules = {
  exports: [],
  members: [],
  keys: [],
};

/**
 * Framing: the camera part, `ViewFraming` (`getViewFraming`,
 * `setViewFraming`, `viewportProjection.getFraming`, `withFraming`), and
 * `displayArea` only in the view state (lanes N3, VS1). AP and VS1 run in
 * parallel: each keeps to its own table and its own function.
 */
const framing: Rules = {
  exports: [],
  members: [],
  keys: [],
};

export const rules: Rules = mergeRules(appearance, framing);

/**
 * The rewrites of the appearance that no table entry says.
 */
function rewriteAppearance(_run: Run): void {}

/**
 * The rewrites of the framing that no table entry says.
 */
function rewriteFraming(_run: Run): void {}

/**
 * The rewrites of this family that no table entry says. They run before the
 * tables of every family; a site they rewrite or report is marked handled
 * (`run.handled`), and the tables leave it.
 */
export function rewrite(run: Run): void {
  rewriteAppearance(run);
  rewriteFraming(run);
}
