import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';

const { PointsManager } = csUtils;

type OmitKeyHandler = ((key: string, value: unknown) => unknown) | null;

function cloneContourValue(_key: string, value: unknown): unknown {
  if (value == null || typeof value !== 'object' || !('polyline' in value)) {
    return value;
  }
  const contour = value as { polyline: unknown[]; [k: string]: unknown };
  return {
    ...contour,
    polyline: null,
    pointsManager: PointsManager.create3(
      contour.polyline.length,
      contour.polyline as Types.Point3[]
    ),
  };
}

/**
 * Keys that are known to hold large or non-cloneable data (e.g. in annotation
 * data or cachedStats). When the value is null, the key is omitted. When the
 * value is a function, it is called with (key, value) and the return value is
 * used as the new value for that key.
 * - pointsInVolume: large array of Point3 (e.g. CircleROIStartEndThresholdTool)
 * - projectionPoints: array of arrays of Point3 (e.g. CircleROIStartEndThresholdTool)
 * - contour: cloneable via polyline → pointsManager (handled by cloneContourValue)
 * - spline: annotation-specific object with non-cloneable refs (omitted)
 */
const OMIT_KEYS = new Map<string, OmitKeyHandler>([
  ['pointsInVolume', null],
  ['projectionPoints', null],
  ['contour', cloneContourValue],
  ['spline', null],
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
      const handler = OMIT_KEYS.get(key);
      if (handler) {
        result[key] = handler(key, value);
      }
      continue;
    }
    if (value === null || value === undefined || typeof value !== 'object') {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value.map((value) =>
        safeStructuredClone(value as Record<string, unknown>)
      );
    } else {
      result[key] = omitUncloneableKeys(value as Record<string, unknown>);
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
    return value.map((item) => safeStructuredClone(item)) as unknown as T;
  }
  return omitUncloneableKeys(value as Record<string, unknown>) as T;
}
