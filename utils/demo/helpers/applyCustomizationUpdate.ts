import update, { extend } from 'immutability-helper';

/**
 * The update function OHIF's customization service uses to merge a customization
 * value over an existing one — `immutability-helper`'s `update`, plus OHIF's
 * custom `$filter` command.
 *
 * This lives in the **demo helpers** rather than in a package: it is the seam an
 * example needs to merge a rule set the way an OHIF deployment would, and
 * `immutability-helper` is a root devDependency (pinned to `3.1.1`, the version
 * `@ohif/core` uses) so no published Cornerstone package gains a dependency.
 * Nothing under `packages/` imports this file.
 *
 * Commands are `immutability-helper`'s built-ins — `$set`, `$merge`, `$push`,
 * `$unshift`, `$splice`, `$apply`, `$toggle`, `$add`, `$remove` — plus
 * {@link applyFilterCommand}'s `$filter`. A value with no command at all is the
 * new value rather than a spec, matching OHIF's `hasDollarKey` short-circuit.
 */

/** A command spec: `$`-commands, or a nested object of specs. */
export type UpdateSpec = Record<string, unknown>;

/**
 * True when `value` contains an update command anywhere in its object tree.
 *
 * Mirrors OHIF's `hasDollarKey`, including its two exemptions:
 * - a React element (branded with `$$typeof`) is a value to render, not a spec,
 *   so its brand must not be misread as a command;
 * - `$transform` and `$reference` are read-time markers OHIF's service resolves
 *   itself, not merge commands, so a value carrying them is stored verbatim.
 */
export function hasUpdateCommand(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasUpdateCommand);
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (record.$$typeof) {
    return false;
  }

  return Object.keys(record).some(
    (key) =>
      (key.startsWith('$') && key !== '$transform' && key !== '$reference') ||
      hasUpdateCommand(record[key])
  );
}

/**
 * OHIF's `$filter` command, registered onto `immutability-helper` below. It does
 * four different things to an array depending on the query it is given:
 *
 * - a **function** — keep the items it returns true for.
 * - a **string** — drop the items whose `id` equals it. This is how a
 *   customization removes a rule (or a toolbar button) by id.
 * - `{ match, $merge }` — shallow-merge `$merge` into every item matching all of
 *   `match`'s key/value pairs.
 * - `{ id, $merge }` — the same, matching on `id` only (OHIF back-compat).
 *
 * Recurses into nested objects and arrays, so a query reaches arrays at any depth.
 *
 * Ported from `CustomizationService.ts` rather than reinvented, so an example and
 * an OHIF deployment resolve the same customization identically.
 */
export function applyFilterCommand(original: unknown, query: unknown): unknown {
  function objectMatches(item: unknown, matchObj: Record<string, unknown>) {
    return (
      Boolean(item) &&
      typeof item === 'object' &&
      Object.entries(matchObj).every(
        ([key, value]) => (item as Record<string, unknown>)[key] === value
      )
    );
  }

  function deepFilter(value: unknown, filterQuery: unknown): unknown {
    if (Array.isArray(value)) {
      // 1) A function filters the array.
      if (typeof filterQuery === 'function') {
        return value.filter(filterQuery as (item: unknown) => boolean);
      }

      // 2) A string removes the items with that id.
      if (typeof filterQuery === 'string') {
        return value.filter(
          (item) => (item as Record<string, unknown>)?.id !== filterQuery
        );
      }

      if (filterQuery && typeof filterQuery === 'object') {
        const q = filterQuery as Record<string, unknown>;

        // 3) { match, $merge } merges into every matching item.
        if (q.match && q.$merge) {
          // Recurse first so deeply nested arrays are handled too.
          const result = value.map((item) => deepFilter(item, filterQuery));
          return result.map((item) =>
            objectMatches(item, q.match as Record<string, unknown>)
              ? { ...(item as object), ...(q.$merge as object) }
              : item
          );
        }

        // 4) { id, $merge } — the same, on id only.
        if (q.id && q.$merge) {
          const result = value.map((item) => deepFilter(item, filterQuery));
          return result.map((item) =>
            (item as Record<string, unknown>)?.id === q.id
              ? { ...(item as object), ...(q.$merge as object) }
              : item
          );
        }
      }

      // Otherwise just recurse without filtering.
      return value.map((item) => deepFilter(item, filterQuery));
    }

    if (value && typeof value === 'object') {
      const newObj = { ...(value as Record<string, unknown>) };
      for (const [key, val] of Object.entries(newObj)) {
        newObj[key] = deepFilter(val, filterQuery);
      }
      return newObj;
    }

    return value;
  }

  return deepFilter(original, query);
}

// `extend` registers the command globally on immutability-helper, exactly as
// OHIF's CustomizationService does at module scope. Registering the same name
// twice is harmless — it is the same implementation.
extend('$filter', (query, original) => applyFilterCommand(original, query));

/**
 * Applies a customization spec to a value, returning a new value (the input is
 * never mutated). A spec with no `$` command replaces the value outright, which
 * is how OHIF treats a plain customization value.
 *
 * @param source - the current value, e.g. the default display set selector.
 * @param spec - a command spec, or a plain value that replaces `source`.
 * @returns the updated value.
 */
export function applyCustomizationUpdate<T>(source: T, spec: unknown): T {
  if (!hasUpdateCommand(spec)) {
    return spec as T;
  }

  return update(source, spec as never) as T;
}

export default applyCustomizationUpdate;
