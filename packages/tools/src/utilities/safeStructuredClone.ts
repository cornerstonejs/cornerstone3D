/**
 * Keys that are known to hold large or non-cloneable data (e.g. in annotation
 * data or cachedStats). These are omitted when cloning so that structuredClone
 * does not fail or copy huge arrays.
 * - pointsInVolume: large array of Point3 (e.g. CircleROIStartEndThresholdTool)
 * - projectionPoints: array of arrays of Point3 (e.g. CircleROIStartEndThresholdTool)
 * - contour, spline: annotation-specific objects with non-cloneable refs (handled separately)
 */
const OMIT_KEYS = new Set([
  'pointsInVolume',
  'projectionPoints',
  'contour',
  'spline',
]);

/**
 * Recursively copies an object, omitting known large/non-cloneable keys.
 */
function omitUncloneableKeys(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (OMIT_KEYS.has(key)) {
      continue;
    }
    if (value === null || value === undefined || typeof value !== 'object') {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value;
    } else {
      result[key] = omitUncloneableKeys(value as Record<string, unknown>);
    }
  }
  return result;
}

/**
 * Tries to clone a single value with structuredClone. Returns null on failure.
 */
function tryCloneValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== 'object') {
    return value;
  }
  try {
    return structuredClone(value);
  } catch {
    return null;
  }
}

/**
 * Recursively clones an object, omitting omit-keys and replacing any value that
 * fails structuredClone with null.
 */
function cloneRecursiveWithFallback(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (OMIT_KEYS.has(key)) {
      continue;
    }
    if (value === null || value === undefined || typeof value !== 'object') {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = tryCloneValue(value);
    } else {
      const cloned = tryCloneValue(value);
      result[key] =
        cloned !== null
          ? cloned
          : cloneRecursiveWithFallback(value as Record<string, unknown>);
    }
  }
  return result;
}

/**
 * Like structuredClone, but safe for annotation-style data: omits known large
 * or non-cloneable keys (e.g. pointsInVolume, projectionPoints) and replaces
 * any value that cannot be cloned with null if the whole clone fails.
 * Use for cloning annotation data or other objects that may contain large
 * arrays or non-cloneable references.
 *
 * @param value - Any value (typically annotation data object).
 * @returns Deep copy with omit-keys stripped and uncloneable values nulled on fallback.
 */
export function safeStructuredClone<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    try {
      return structuredClone(value) as T;
    } catch {
      return [] as T;
    }
  }
  const obj = value as Record<string, unknown>;
  const withoutLarge = omitUncloneableKeys(obj);
  try {
    return structuredClone(withoutLarge) as T;
  } catch {
    return cloneRecursiveWithFallback(obj) as T;
  }
}
