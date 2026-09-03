import {
  createDisplaySetSplitRules,
  rawDisplaySetSelector,
} from './rawDisplaySetSelector';
import type { SplitRule } from './types';

/**
 * Default display-set split rules (OHIF PR parity + video, ECG, volume3d).
 *
 * These are the compiled form of {@link rawDisplaySetSelector} - the rules are
 * authored as serializable data in `rawDisplaySetSelector.js` and turned into the
 * predicates the split engine runs by `createDisplaySetSplitRules`. Compiling the
 * defaults through the same path every application uses keeps the data form
 * honest: if the raw vocabulary could not express a default rule, this file would
 * not build.
 *
 * Rules are evaluated in order; the first match wins. Each rule's `viewportTypes`
 * (index 0 = preferred) is applied to the resulting display set.
 *
 * To customize splitting, do not edit this list - compile your own selector (or
 * one derived from `rawDisplaySetSelector`) with `createDisplaySetSplitRules` and
 * pass the result as `splitRules`.
 */
export const defaultDisplaySetSplitRules: SplitRule[] =
  createDisplaySetSplitRules(rawDisplaySetSelector);
