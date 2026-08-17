/**
 * The update function OHIF's customization service uses to merge a customization
 * value over an existing one.
 *
 * OHIF implements this with `immutability-helper`'s `update` plus a custom
 * `$filter` command (see `CustomizationService._update`). This is the same command
 * vocabulary reimplemented here, in the **demo helpers**, so an example can merge
 * a user-supplied rule set exactly the way an OHIF deployment would — without
 * `immutability-helper` becoming a dependency of any published Cornerstone
 * package. Nothing in `packages/` imports this file.
 *
 * Supported commands, matching the subset OHIF customizations actually use:
 *
 * | Command    | Effect                                                        |
 * | ---------- | ------------------------------------------------------------- |
 * | `$set`     | Replace the value outright                                    |
 * | `$merge`   | Shallow-merge an object over the target                       |
 * | `$push`    | Append items to an array                                      |
 * | `$unshift` | Prepend items to an array                                     |
 * | `$splice`  | Apply `Array.prototype.splice` argument tuples                |
 * | `$apply`   | Replace with the result of a function of the current value    |
 * | `$filter`  | OHIF's array command — see {@link applyFilterCommand}         |
 *
 * A spec with no `$` command anywhere replaces the value, which is how OHIF
 * treats a plain customization value (`hasDollarKey` is false → return newValue).
 */

/** A command spec: either `$`-commands, or a nested object of specs. */
export type UpdateSpec = Record<string, unknown>;

const COMMANDS = new Set([
  '$set',
  '$merge',
  '$push',
  '$unshift',
  '$splice',
  '$apply',
  '$filter',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * True when `value` contains an update command anywhere in its object tree.
 *
 * Mirrors OHIF's `hasDollarKey`: without a command the value is not a spec at
 * all, it is the new value.
 */
export function hasUpdateCommand(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasUpdateCommand);
  }
  if (!isPlainObject(value)) {
    return false;
  }
  return Object.entries(value).some(
    ([key, nested]) => COMMANDS.has(key) || hasUpdateCommand(nested)
  );
}

function objectMatches(item: unknown, match: Record<string, unknown>): boolean {
  return (
    isPlainObject(item) &&
    Object.entries(match).every(([key, value]) => item[key] === value)
  );
}

/**
 * OHIF's `$filter` command, which does four different things to an array
 * depending on the query it is given:
 *
 * - a **function** — keep the items it returns true for.
 * - a **string** — drop the items whose `id` equals it. This is how a
 *   customization removes a rule (or a toolbar button) by id.
 * - `{ match, $merge }` — shallow-merge `$merge` into every item matching all of
 *   `match`'s key/value pairs.
 * - `{ id, $merge }` — the same, matching on `id` only (OHIF back-compat).
 *
 * Recurses into nested objects and arrays so a query reaches arrays at any depth.
 */
export function applyFilterCommand(value: unknown, query: unknown): unknown {
  if (Array.isArray(value)) {
    if (typeof query === 'function') {
      return value.filter(query as (item: unknown) => boolean);
    }

    if (typeof query === 'string') {
      return value.filter((item) => !isPlainObject(item) || item.id !== query);
    }

    if (isPlainObject(query) && query.$merge) {
      const merge = query.$merge as Record<string, unknown>;
      const match = isPlainObject(query.match)
        ? (query.match as Record<string, unknown>)
        : query.id !== undefined
          ? { id: query.id }
          : undefined;

      // Recurse first so deeply nested arrays are handled too, then merge.
      const recursed = value.map((item) => applyFilterCommand(item, query));
      if (!match) {
        return recursed;
      }
      return recursed.map((item) =>
        objectMatches(item, match) ? { ...(item as object), ...merge } : item
      );
    }

    return value.map((item) => applyFilterCommand(item, query));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = { ...value };
    for (const [key, nested] of Object.entries(result)) {
      result[key] = applyFilterCommand(nested, query);
    }
    return result;
  }

  return value;
}

/**
 * Applies an update spec to a value, returning a new value (the input is never
 * mutated).
 *
 * @param source - the current value, e.g. the default display set selector.
 * @param spec - a command spec, or a plain value that replaces `source`.
 * @returns the updated value.
 */
export function applyCustomizationUpdate<T>(source: T, spec: unknown): T {
  // A value with no commands is the new value, not a spec.
  if (!hasUpdateCommand(spec)) {
    return spec as T;
  }

  if (!isPlainObject(spec)) {
    return spec as T;
  }

  if ('$set' in spec) {
    return spec.$set as T;
  }

  if ('$apply' in spec) {
    const apply = spec.$apply;
    if (typeof apply !== 'function') {
      throw new Error('$apply expects a function');
    }
    return (apply as (value: T) => T)(source);
  }

  if ('$filter' in spec) {
    return applyFilterCommand(source, spec.$filter) as T;
  }

  if ('$merge' in spec) {
    const merge = spec.$merge;
    if (!isPlainObject(merge)) {
      throw new Error('$merge expects an object');
    }
    return { ...(source as object), ...merge } as T;
  }

  if ('$push' in spec || '$unshift' in spec || '$splice' in spec) {
    if (!Array.isArray(source)) {
      throw new Error(
        `${
          '$push' in spec
            ? '$push'
            : '$unshift' in spec
              ? '$unshift'
              : '$splice'
        } expects an array target`
      );
    }
    let result = [...source];

    if ('$push' in spec) {
      result = result.concat(spec.$push as unknown[]);
    }
    if ('$unshift' in spec) {
      result = (spec.$unshift as unknown[]).concat(result);
    }
    if ('$splice' in spec) {
      for (const args of spec.$splice as [number, number?, ...unknown[]][]) {
        result.splice(...(args as [number, number, ...unknown[]]));
      }
    }

    return result as T;
  }

  // No command at this level: recurse into the keys the spec mentions, leaving
  // the rest of `source` untouched.
  const isArraySource = Array.isArray(source);
  const result: Record<string, unknown> = isArraySource
    ? ({ ...(source as unknown as Record<string, unknown>) } as never)
    : { ...(source as unknown as Record<string, unknown>) };

  for (const [key, nested] of Object.entries(spec)) {
    result[key] = applyCustomizationUpdate(result[key], nested);
  }

  if (isArraySource) {
    // Preserve array-ness when a spec addressed items by index.
    const array = [...(source as unknown[])];
    for (const [key, nested] of Object.entries(spec)) {
      const index = Number(key);
      if (Number.isInteger(index)) {
        array[index] = applyCustomizationUpdate(array[index], nested);
      }
    }
    return array as unknown as T;
  }

  return result as T;
}

export default applyCustomizationUpdate;
