import type { Types } from '@cornerstonejs/core';

/**
 * Represents an angular interval, where the first element is the start angle
 * and the second element is the end angle. Angles are in degrees.
 * If the end angle is less than the start angle, it implies the interval
 * crosses the 0/360 degree boundary.
 */
export type Interval = Types.Point2;

/**
 * Represents a pair of points that define a sector of a fan.
 * These points, along with a center point, define an angular interval.
 */
export type FanPair = [Types.Point2, Types.Point2];

/**
 * Represents a collection of FanPair objects.
 */
export type FanPairs = FanPair[];

/**
 * Normalizes an angle to be within the range [0, 360).
 *
 * @param angle - The angle in degrees.
 * @returns The normalized angle.
 */
function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/**
 * Calculates the angle of a point relative to a center point.
 * The angle is measured in degrees, counter-clockwise from the positive x-axis.
 *
 * @param center - The center point.
 * @param point - The point for which to calculate the angle.
 * @returns The angle in degrees, normalized to [0, 360).
 */
export function angleFromCenter(
  center: Types.Point2,
  point: Types.Point2
): number {
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return normalizeAngle(angle);
}

/**
 * Creates an angle interval from a pair of points and a center.
 * The interval [start, end] represents an angular sector.
 * If the end angle is less than the start angle, the angles are switched
 *
 * @param center - The center point of the fan.
 * @param pair - A pair of points defining the start and end of the fan sector.
 * @returns An array representing the angular interval [startAngle, endAngle] in degrees.
 */
export function intervalFromPoints(
  center: Types.Point2,
  pair: [Types.Point2, Types.Point2]
): number[] {
  const start = angleFromCenter(center, pair[0]);
  const end = angleFromCenter(center, pair[1]);
  return start < end ? [start, end] : [end, start];
}

/**
 * Merges overlapping angular intervals.
 * The input intervals are sorted by their start angles.
 *
 * @param intervals - An array of angular intervals to merge.
 * @returns A new array of merged, non-overlapping angular intervals.
 */
function mergeIntervals(intervals: Interval[]): Interval[] {
  if (!intervals.length) {
    return [];
  }
  // Sort intervals by their start angle.
  intervals.sort((a, b) => a[0] - b[0]);

  const merged: Interval[] = [intervals[0].slice() as Interval];

  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    const current = intervals[i];

    // If the current interval overlaps with the last merged interval, merge them.
    if (current[0] <= last[1]) {
      last[1] = Math.max(last[1], current[1]);
    } else {
      // Otherwise, add the current interval as a new merged interval.
      merged.push(current.slice() as Interval);
    }
  }
  return merged;
}

/**
 * Clips an inner angular interval against a set of merged outer angular intervals.
 * This function finds the parts of the inner interval that are also covered by any of the outer intervals.
 *
 * @param inner - The inner angular interval [startAngle, endAngle].
 * @param outerMerged - An array of merged, non-overlapping outer angular intervals.
 * @returns An array of clipped angular intervals. Each interval is a part of the `inner`
 * interval that intersects with one of the `outerMerged` intervals.
 */
function clipInterval(
  inner: Types.Point2,
  outerMerged: Interval[]
): Interval[] {
  const result: Interval[] = [];
  for (const out of outerMerged) {
    // Find the intersection of the inner interval and the current outer interval.
    const start = Math.max(inner[0], out[0]);
    const end = Math.min(inner[1], out[1]);

    // If there is a valid intersection (start < end), add it to the result.
    if (start < end) {
      result.push([start, end]);
    }
  }
  return result;
}

/**
 * Calculates the percentage of an inner fan (defined by `innerFanPairs`)
 * that is covered by an outer fan (defined by `outerFanPairs`), relative
 * to a common center point.
 *
 * This is useful for determining how much of a region of interest (inner fan)
 * falls within a larger field of view or permissible area (outer fan).
 *
 * The calculation involves:
 * 1. Converting all fan pairs (both outer and inner) to angular intervals.
 * 2. Merging the outer fan intervals to get a set of non-overlapping angular sectors
 *    representing the total outer fan area.
 * 3. For each inner fan interval:
 *    a. Clipping it against the merged outer fan intervals. This finds the portions
 *       of the inner fan sector that are actually covered by the outer fan.
 * 4. Merging all these clipped inner intervals to avoid double-counting areas
 *    where multiple inner fan sectors might overlap within the outer fan.
 * 5. Calculating the total angular span of the merged outer fan and the
 *    total angular span of the final merged (and clipped) inner fan.
 * 6. The percentage is (total inner span / total outer span) * 100.
 *
 * @param center - The common center point for both fans.
 * @param outerFanPairs - An array of point pairs defining the sectors of the outer fan.
 * @param innerFanPairs - An array of point pairs defining the sectors of the inner fan.
 * @returns The percentage of the inner fan covered by the outer fan, clamped between 0 and 100.
 * Returns 0 if the outer fan has no area (outerTotal is 0).
 */
export function calculateInnerFanPercentage(
  center: Types.Point2,
  outerFanPairs: FanPairs,
  innerFanPairs: FanPairs
): number {
  // Convert outer fan pairs to angular intervals
  const outerIntervals = outerFanPairs.map((pair) =>
    intervalFromPoints(center, pair)
  ) as Interval[];
  // Merge outer intervals to get a clean representation of the outer fan area
  const mergedOuter = mergeIntervals(outerIntervals);
  // Calculate the total angular span of the outer fan
  const outerTotal = mergedOuter.reduce((sum, [a, b]) => sum + (b - a), 0);

  // If the outer fan has no area, the percentage of coverage is 0.
  if (outerTotal === 0) {
    return 0;
  }

  const clippedInnerIntervals: Interval[] = [];

  // For each inner fan sector:
  for (const pair of innerFanPairs) {
    // Convert the inner fan pair to an angular interval
    const innerInterval = intervalFromPoints(center, pair) as Interval;
    // Clip this inner interval against the merged outer fan area
    const clipped = clipInterval(innerInterval, mergedOuter);
    // Add all resulting clipped portions to our list
    clippedInnerIntervals.push(...clipped);
  }

  // Merge all clipped inner intervals. This is important to correctly sum the
  // total inner area that's covered, especially if inner fan sectors overlap
  // after being clipped by the outer fan.
  const mergedInner = mergeIntervals(clippedInnerIntervals);
  // Calculate the total angular span of the (clipped and merged) inner fan
  const innerTotal = mergedInner.reduce((sum, [a, b]) => sum + (b - a), 0);

  // Calculate the percentage
  const percentage = (innerTotal / outerTotal) * 100;

  // Clamp the percentage between 0 and 100
  return Math.min(100, Math.max(0, percentage));
}
