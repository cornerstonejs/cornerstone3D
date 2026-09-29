import type { SplitRule, SplitRuleSet } from './types';

/**
 * Throws with the offending entry named - a rule set is usually merged from
 * several customization layers, so the message must say which rule is wrong.
 */
function invalidEntry(id: string, message: string): never {
  throw new Error(`Invalid split rule set entry "${id}": ${message}`);
}

/**
 * Checks one rule set entry, and says whether it is included.
 *
 * @returns false for an entry with a `null` priority, which excludes it.
 * @throws if the entry is not an object, has a priority that is neither `null`
 *   nor a finite number, or states an `id` that differs from its key.
 */
export function validateSplitRuleSetEntry(
  id: string,
  entry: { id?: string; priority?: number | null } | null | undefined
): boolean {
  if (!entry || typeof entry !== 'object') {
    invalidEntry(id, 'the entry must be an object');
  }
  if (entry.id !== undefined && entry.id !== id) {
    invalidEntry(
      id,
      `the entry states id "${entry.id}", but its key is the id. Remove the id, or make it equal to the key.`
    );
  }
  const { priority } = entry;
  if (priority === null) {
    return false;
  }
  if (typeof priority !== 'number' || !Number.isFinite(priority)) {
    invalidEntry(
      id,
      `priority must be a finite number, or null to exclude the rule; got ${JSON.stringify(priority)}`
    );
  }
  return true;
}

/**
 * The included entries of a keyed rule set, in evaluation order, each with its
 * key as its `id` and without its `priority`.
 *
 * - A `null` priority excludes the rule.
 * - Rules are ordered by ascending priority. Equal priorities are ordered by id
 *   (UTF-16 code unit order, not a locale collation), so the result never
 *   depends on the order the keys were inserted in.
 *
 * Generic over the entry shape so that the raw (data) selector and the compiled
 * rules share one ordering implementation.
 *
 * @throws see {@link validateSplitRuleSetEntry}.
 */
export function orderSplitRuleSetEntries<
  Entry extends { id?: string; priority?: number | null },
>(
  ruleSet: Record<string, Entry>
): (Omit<Entry, 'priority'> & { id: string })[] {
  if (!ruleSet || typeof ruleSet !== 'object' || Array.isArray(ruleSet)) {
    throw new Error(
      `A split rule set must be an object keyed by rule id: ${JSON.stringify(ruleSet)}`
    );
  }

  const included: { id: string; priority: number; entry: Entry }[] = [];
  for (const [id, entry] of Object.entries(ruleSet)) {
    if (validateSplitRuleSetEntry(id, entry)) {
      included.push({ id, priority: entry.priority as number, entry });
    }
  }

  included.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return included.map(({ id, entry }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { priority, ...rule } = entry;
    return { ...rule, id };
  });
}

/**
 * The rules of a {@link SplitRuleSet} in evaluation order - the order the split
 * engine tries them in. See {@link orderSplitRuleSetEntries}.
 */
export function resolveSplitRuleSet(ruleSet: SplitRuleSet): SplitRule[] {
  return orderSplitRuleSetEntries(ruleSet) as SplitRule[];
}
