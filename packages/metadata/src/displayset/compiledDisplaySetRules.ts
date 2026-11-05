import { createDisplaySetSplitRules, displaySetRules } from './displaySetRules';
import type { SplitRuleSet } from './types';

/**
 * Default display-set split rules (OHIF PR parity + video, ECG, volume3d),
 * keyed by rule id.
 *
 * These are the compiled form of {@link displaySetRules} - the rules are
 * authored as serializable data in `displaySetRules.js` and turned into the
 * predicates the split engine runs by `createDisplaySetSplitRules`. Compiling the
 * defaults through the same path every application uses keeps the data form
 * honest: if the raw vocabulary could not express a default rule, this file would
 * not build.
 *
 * Rules are evaluated in ascending `priority` (the defaults use `10` to `170`
 * in steps of 10, with `80` reserved, and `unsupported` last); the
 * first match wins. The `handler` of a rule decides the class of the display
 * set and `isDisplayable`; a rule gives no viewport hint.
 *
 * To customize splitting, do not edit this set - merge your own rules over it by
 * key (a new id adds a rule, an existing id replaces one, `priority: null`
 * excludes one), or compile your own rule set with `createDisplaySetSplitRules`.
 */
export const compiledDisplaySetRules: SplitRuleSet =
  createDisplaySetSplitRules(displaySetRules);

/** @deprecated Use {@link compiledDisplaySetRules}. */
export const defaultDisplaySetSplitRules = compiledDisplaySetRules;
