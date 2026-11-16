import { createDisplaySetSplitRules } from './displaySetRules';
import type { SplitRuleSet } from './types';

/**
 * The default display-set split rules, compiled, in the default order.
 *
 * These are the compiled form of `displaySetRules` in the order of
 * `displaySetRuleOrder` - the rules are authored as serializable data in
 * `displaySetRules.js` and turned into the predicates the split engine runs by
 * `createDisplaySetSplitRules`. Compiling the defaults through the same path
 * every application uses keeps the data form honest: if the raw vocabulary
 * could not express a default rule, this file would not build.
 *
 * The first rule that matches an instance claims it. The `handler` of a rule
 * decides the class of the display set and `isDisplayable`; a rule gives no
 * viewport hint.
 *
 * To customize splitting, do not edit this list - change a copy of the
 * registry or of the order, and compile the result with
 * `createDisplaySetSplitRules(materializeSplitRules(registry, order))`.
 */
export const compiledDisplaySetRules: SplitRuleSet =
  createDisplaySetSplitRules();

/** @deprecated Use {@link compiledDisplaySetRules}. */
export const defaultDisplaySetSplitRules = compiledDisplaySetRules;
