import {
  createDisplaySetSplitRules,
  rawDisplaySetSelector,
} from './rawDisplaySetSelector';
import type { SplitRuleSet } from './types';

/**
 * Default display-set split rules (OHIF PR parity + video, ECG, volume3d),
 * keyed by rule id.
 *
 * These are the compiled form of {@link rawDisplaySetSelector} - the rules are
 * authored as serializable data in `rawDisplaySetSelector.js` and turned into the
 * predicates the split engine runs by `createDisplaySetSplitRules`. Compiling the
 * defaults through the same path every application uses keeps the data form
 * honest: if the raw vocabulary could not express a default rule, this file would
 * not build.
 *
 * Rules are evaluated in ascending `priority` (the defaults use `1..n`); the
 * first match wins. Each rule's `viewportTypes` (index 0 = preferred) is
 * applied to the resulting display set.
 *
 * To customize splitting, do not edit this set - merge your own rules over it by
 * key (a new id adds a rule, an existing id replaces one, `priority: null`
 * excludes one), or compile your own selector with `createDisplaySetSplitRules`.
 */
export const defaultDisplaySetSplitRules: SplitRuleSet =
  createDisplaySetSplitRules(rawDisplaySetSelector);
