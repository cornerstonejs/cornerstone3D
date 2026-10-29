/**
 * The optional display set rules: rules that a host turns on by id, in
 * addition to the default rules. Each one is a JSON file in
 * `rules/optional/<id>.json` of the npm package, so a server reads the same
 * data as a viewer.
 *
 * @module displayset/optionalDisplaySetRules
 */

import { hasOwn } from '../safeFunctions';
import { defaultMetadataContext } from './displaySetContext';
import type { ContextEntry } from './displaySetContext';
import { displaySetRules } from './displaySetRules';
import type {
  DisplaySetRules,
  OptionalDisplaySetRuleFile,
} from './displaySetRulesTypes';
import { optionalDisplaySetRuleFiles } from './optionalDisplaySetRules.generated';

/** Freezes a JSON value and every object or array in it. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * The optional rule files, keyed by file id (the file name without `.json`).
 * Each value is the content of `rules/optional/<id>.json`. The data is frozen,
 * so a consumer cannot change the result of a later
 * {@link withOptionalDisplaySetRules} call.
 */
export const optionalDisplaySetRules: Readonly<
  Record<string, OptionalDisplaySetRuleFile>
> = deepFreeze(optionalDisplaySetRuleFiles);

/** The result of {@link withOptionalDisplaySetRules}. */
export type WithOptionalDisplaySetRules = {
  /** The base rules and the rules of the selected files. */
  rules: DisplaySetRules;
  /** The `displaySetContext` entries of the selected files. */
  context: Record<string, ContextEntry>;
};

/**
 * Merges the selected optional rule files into a rule set. The result goes
 * directly to `createDisplaySetSplitRules`:
 *
 * ```ts
 * const { rules, context } = withOptionalDisplaySetRules([
 *   'dwiByBValue',
 *   'byAcquisitionTime',
 * ]);
 * const ruleSet = createDisplaySetSplitRules(rules, { context });
 * ```
 *
 * The merge never replaces a rule or a context entry. A rule id that is
 * already in the base rules or in an earlier file, and a context name that is
 * already in `defaultMetadataContext` or in an earlier file, is an error. To
 * replace a default rule, merge the rule over the result by key.
 *
 * The check covers `defaultMetadataContext` only. A host with its own context
 * merges the result into it, `{ ...hostContext, ...context }`, and checks its
 * own names: in that merge, an entry of `context` wins.
 *
 * @param ids - the file ids, see {@link optionalDisplaySetRules}.
 * @param baseRules - the rules to add to. Defaults to `displaySetRules`.
 * @throws for an unknown file id, and for a collision of a rule id or a
 *   context name.
 */
export function withOptionalDisplaySetRules(
  ids: readonly string[],
  baseRules: DisplaySetRules = displaySetRules
): WithOptionalDisplaySetRules {
  const rules: DisplaySetRules = { ...baseRules };
  const context: Record<string, ContextEntry> = {};
  const ruleSource: Record<string, string> = {};
  const contextSource: Record<string, string> = {};

  for (const id of ids) {
    if (!hasOwn(optionalDisplaySetRules, id)) {
      throw new Error(
        `withOptionalDisplaySetRules: unknown optional rule file '${id}'; known: ${Object.keys(optionalDisplaySetRules).join(', ')}`
      );
    }
    // A copy, so a change of the result does not reach the shared data.
    const file = structuredClone(optionalDisplaySetRules[id]);
    for (const [ruleId, rule] of Object.entries(file.rules)) {
      if (hasOwn(rules, ruleId)) {
        throw new Error(
          `withOptionalDisplaySetRules: the rule id '${ruleId}' of '${id}' is already in ${ruleSource[ruleId] ? `'${ruleSource[ruleId]}'` : 'the base rules'}`
        );
      }
      rules[ruleId] = rule;
      ruleSource[ruleId] = id;
    }
    for (const [name, entry] of Object.entries(file.displaySetContext ?? {})) {
      if (hasOwn(context, name) || hasOwn(defaultMetadataContext, name)) {
        throw new Error(
          `withOptionalDisplaySetRules: the context name '${name}' of '${id}' is already in ${contextSource[name] ? `'${contextSource[name]}'` : 'the default metadata context'}`
        );
      }
      context[name] = entry;
      contextSource[name] = id;
    }
  }
  return { rules, context };
}
