import { isUnsafeKey } from '../safeFunctions/schema';
import type { SplitRule, SplitRuleSet } from './types';

/**
 * Throws with the offending entry named - a rule set is usually built from
 * several customization layers, so the message must say which rule is wrong.
 */
function invalidEntry(id: string, message: string): never {
  throw new Error(`Invalid split rule set entry "${id}": ${message}`);
}

/**
 * Checks one rule id: a string that is not an unsafe key, and unique in its
 * list.
 */
function checkRuleId(id: unknown, seen: Set<string>): string {
  if (typeof id !== 'string' || !id) {
    throw new Error(
      `A split rule needs a non-empty string id; got ${JSON.stringify(id)}`
    );
  }
  // A registry is a plain object keyed by id, and `rules['__proto__'] = rule`
  // replaces the prototype of the registry instead of adding the rule.
  if (isUnsafeKey(id)) {
    invalidEntry(id, 'the id is not allowed; give the rule another id');
  }
  if (seen.has(id)) {
    invalidEntry(id, 'the id occurs more than once in the rule order');
  }
  seen.add(id);
  return id;
}

/**
 * The rules of a registry in the order of a list of ids: the step between the
 * customizable data and the split code.
 *
 * - `registry` maps each rule id to its rule. A rule that `order` does not name
 *   is not used, so the order in which a host adds rules to the registry does
 *   not matter.
 * - `order` is the list of rule ids, in evaluation order. The first rule that
 *   matches an instance claims it.
 *
 * Each result entry is the rule with its key as its `id`.
 *
 * @throws for an id of `order` that is not in `registry`, for an id that occurs
 *   twice, and for an entry that is not an object or that states another id.
 */
export function materializeSplitRules<Entry extends { id?: string }>(
  registry: Record<string, Entry>,
  order: readonly string[]
): (Entry & { id: string })[] {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new Error(
      `A split rule registry must be an object keyed by rule id: ${JSON.stringify(registry)}`
    );
  }
  if (!Array.isArray(order)) {
    throw new Error(
      `A split rule order must be an array of rule ids: ${JSON.stringify(order)}`
    );
  }
  const seen = new Set<string>();
  return order.map((value) => {
    const id = checkRuleId(value, seen);
    if (!Object.prototype.hasOwnProperty.call(registry, id)) {
      invalidEntry(
        id,
        'the rule order names an id that is not in the registry'
      );
    }
    const entry = registry[id];
    if (!entry || typeof entry !== 'object') {
      invalidEntry(id, 'the entry must be an object');
    }
    if (entry.id !== undefined && entry.id !== id) {
      invalidEntry(
        id,
        `the entry states id "${entry.id}", but its key is the id. Remove the id, or make it equal to the key.`
      );
    }
    return { ...entry, id };
  });
}

/**
 * Checks an ordered rule set - the form the split engine takes - and returns
 * its rules in evaluation order.
 *
 * @throws if the rule set is not an array, or a rule has no id, an unsafe id,
 *   or the id of an earlier rule.
 */
export function resolveSplitRuleSet(ruleSet: SplitRuleSet): SplitRule[] {
  if (!Array.isArray(ruleSet)) {
    throw new Error(
      `A split rule set must be an array of rules in evaluation order: ${JSON.stringify(ruleSet)}`
    );
  }
  const seen = new Set<string>();
  for (const rule of ruleSet) {
    if (!rule || typeof rule !== 'object') {
      throw new Error(
        `A split rule must be an object: ${JSON.stringify(rule)}`
      );
    }
    checkRuleId(rule.id, seen);
  }
  return ruleSet;
}
