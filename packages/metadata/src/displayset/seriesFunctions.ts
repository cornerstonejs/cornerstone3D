/**
 * The built-in **series functions**: named functions that compute one series
 * fact from the whole series, for a raw series fact
 * `{ name, function, args? }`.
 *
 * A series function does the part of a summary that the expression language
 * cannot: a sort, a mode, a geometric projection. It returns plain data -
 * numbers, and maps keyed by `SOPInstanceUID` - so that the per-instance parts
 * of a rule (`matches`, `groupBy`, `compareInstances`) stay data, and read the
 * result with an index, e.g. `context.series.geometry.index[SOPInstanceUID]`.
 *
 * Every function here is pure, and its result does not depend on the order of
 * the instances it gets, so a split stays independent of the arrival order.
 *
 * @module displayset/seriesFunctions
 */

import { vec3 } from 'gl-matrix';
import { toFiniteNumber } from '@cornerstonejs/utils';
import { readOwn, toFinite } from '../safeFunctions';
import type { NaturalizedInstance, SeriesFunction } from './types';

/** The key of an instance in the maps a series function returns. */
export function instanceKey(instance: NaturalizedInstance): string | undefined {
  const key = instance.SOPInstanceUID ?? instance.imageId;
  return key === undefined ? undefined : String(key);
}

/** Orders instances by {@link instanceKey}, so a result never depends on input order. */
function byKey(a: NaturalizedInstance, b: NaturalizedInstance): number {
  const aKey = instanceKey(a) ?? '';
  const bKey = instanceKey(b) ?? '';
  return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
}

/** A finite number from `args`, else the default. */
function numberArg(
  args: Readonly<Record<string, unknown>>,
  name: string,
  fallback: number
): number {
  return toFinite(readOwn(args, name)) ?? fallback;
}

/** `length` finite numbers read from a multi-valued attribute, else undefined. */
function readVector(
  instance: NaturalizedInstance,
  attribute: string,
  length: number
): number[] | undefined {
  const values = toFiniteNumber(readOwn(instance, attribute) as never);
  if (!Array.isArray(values) || values.length < length) {
    return undefined;
  }
  const vector = values.slice(0, length);
  return vector.every((value) => value !== undefined)
    ? (vector as number[])
    : undefined;
}

const round = (value: number, step: number) => Math.round(value / step) * step;

/** The summary that {@link planeGeometry} returns. */
export type PlaneGeometry = {
  /** The unit normal of the dominant image orientation. */
  normal?: number[];
  /** `ImagePositionPatient` of the regular instance at index 0. */
  origin?: number[];
  /** The slice spacing in mm: the most frequent gap between positions. */
  spacing?: number;
  /** Instances on the regular lattice. */
  regularCount: number;
  /** Instances off the lattice, or without a usable position or orientation. */
  irregularCount: number;
  /** Distinct lattice positions that hold at least one instance. */
  positions: number;
  /** True when the regular positions are `0..positions-1`, with no gap. */
  complete: boolean;
  /** True when one lattice position holds two or more instances. */
  duplicates: boolean;
  /**
   * The distance in mm along `normal` from `origin`, for every instance with
   * the dominant orientation - regular or not. Keyed by {@link instanceKey}.
   */
  distance: Record<string, number>;
  /** The lattice index of each regular instance. Keyed by {@link instanceKey}. */
  index: Record<string, number>;
};

/**
 * The slice geometry of a series: the dominant image plane, the slice spacing,
 * and which instances sit on a regular lattice of that spacing.
 *
 * 1. The dominant orientation is the most frequent `ImageOrientationPatient`
 *    (rounded to 1e-3; a tie goes to the smaller text). The normal comes from
 *    the instance of that orientation with the smallest key.
 * 2. Each instance of that orientation projects its `ImagePositionPatient` on
 *    the normal. The spacing is the most frequent gap between consecutive
 *    distinct positions (rounded to 0.01 mm; a tie goes to the smaller gap).
 * 3. The lattice anchor is the position that puts the most positions on the
 *    lattice (a tie goes to the lower position), so one outlier slice at the
 *    edge does not shift the lattice. A position is on the lattice when its
 *    offset from the anchor, in units of the spacing, is within `tolerance` of
 *    an integer.
 * 4. Index 0 is the lowest regular position, and `origin` is its position.
 *
 * `args.tolerance` is the fraction of the spacing a position may be off the
 * lattice. Default 0.1.
 */
export const planeGeometry: SeriesFunction = (instances, { args }) => {
  const tolerance = numberArg(args, 'tolerance', 0.1);
  const result: PlaneGeometry = {
    regularCount: 0,
    irregularCount: 0,
    positions: 0,
    complete: false,
    duplicates: false,
    distance: {},
    index: {},
  };

  type Candidate = {
    key: string;
    position: number[];
    orientation: number[];
    orientationKey: string;
  };
  const candidates: Candidate[] = [];
  for (const instance of [...instances].sort(byKey)) {
    const key = instanceKey(instance);
    const position = readVector(instance, 'ImagePositionPatient', 3);
    const orientation = readVector(instance, 'ImageOrientationPatient', 6);
    if (key === undefined || !position || !orientation) {
      result.irregularCount++;
      continue;
    }
    candidates.push({
      key,
      position,
      orientation,
      orientationKey: orientation.map((v) => round(v, 1e-3).toFixed(3)).join(),
    });
  }

  const orientationCounts = new Map<string, number>();
  for (const { orientationKey } of candidates) {
    orientationCounts.set(
      orientationKey,
      (orientationCounts.get(orientationKey) ?? 0) + 1
    );
  }
  const [dominant] = [...orientationCounts.entries()].sort(
    ([aKey, aCount], [bKey, bCount]) =>
      bCount - aCount || (aKey < bKey ? -1 : aKey > bKey ? 1 : 0)
  );
  if (!dominant) {
    return result;
  }
  const inPlane = candidates.filter((c) => c.orientationKey === dominant[0]);
  result.irregularCount += candidates.length - inPlane.length;

  const [row0, row1, row2, col0, col1, col2] = inPlane[0].orientation;
  const normal = vec3.cross(
    vec3.create(),
    vec3.fromValues(row0, row1, row2),
    vec3.fromValues(col0, col1, col2)
  );
  vec3.normalize(normal, normal);
  result.normal = Array.from(normal);

  const projected = inPlane.map((candidate) => ({
    ...candidate,
    d: vec3.dot(normal, candidate.position as vec3),
  }));
  // Distinct positions, to 1e-3 mm, in ascending order.
  const distinct = [...new Set(projected.map(({ d }) => round(d, 1e-3)))].sort(
    (a, b) => a - b
  );

  const gapCounts = new Map<number, number>();
  for (let i = 1; i < distinct.length; i++) {
    const gap = round(distinct[i] - distinct[i - 1], 0.01);
    gapCounts.set(gap, (gapCounts.get(gap) ?? 0) + 1);
  }
  const [spacingEntry] = [...gapCounts.entries()].sort(
    ([aGap, aCount], [bGap, bCount]) => bCount - aCount || aGap - bGap
  );
  const spacing = spacingEntry?.[0];
  if (!spacing) {
    // One position, or none: there is no spacing, so no lattice.
    result.irregularCount += inPlane.length;
    return result;
  }
  result.spacing = spacing;

  const offLattice = (from: number, to: number) => {
    const steps = (to - from) / spacing;
    return Math.abs(steps - Math.round(steps)) > tolerance;
  };
  let anchor = distinct[0];
  let bestCount = -1;
  for (const candidate of distinct) {
    const count = distinct.filter((d) => !offLattice(candidate, d)).length;
    if (count > bestCount) {
      bestCount = count;
      anchor = candidate;
    }
  }

  const regular = projected.filter(({ d }) => !offLattice(anchor, d));
  result.irregularCount += projected.length - regular.length;
  result.regularCount = regular.length;
  const lowest = regular.reduce((low, c) => (c.d < low.d ? c : low));
  result.origin = [...lowest.position];

  const occupied = new Map<number, number>();
  for (const { key, d } of projected) {
    result.distance[key] = d - lowest.d;
  }
  for (const { key, d } of regular) {
    const index = Math.round((d - lowest.d) / spacing);
    result.index[key] = index;
    occupied.set(index, (occupied.get(index) ?? 0) + 1);
  }
  result.positions = occupied.size;
  result.complete = Math.max(...occupied.keys()) === occupied.size - 1;
  result.duplicates = [...occupied.values()].some((count) => count > 1);
  return result;
};

/**
 * Seconds from a DICOM DA and TM pair, or from a DT. The time zone offset of a
 * DT is ignored. Without a date, the result is the time of day.
 */
export function dicomDateTimeToSeconds(
  date: unknown,
  time: unknown
): number | undefined {
  const timeText = time == null ? '' : String(time).replace(/:/g, '').trim();
  const dateText = date == null ? '' : String(date).replace(/-/g, '').trim();
  const timeMatch = /^(\d{2})(\d{2})?(\d{2})?(\.\d+)?/.exec(timeText);
  if (!timeMatch) {
    return undefined;
  }
  const [, hh, mm = '0', ss = '0', fraction = ''] = timeMatch;
  const timeOfDay =
    Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(`0${fraction}`);
  const dateMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(dateText);
  if (!dateMatch) {
    return timeOfDay;
  }
  const [, year, month, day] = dateMatch;
  return (
    Date.UTC(Number(year), Number(month) - 1, Number(day)) / 1000 + timeOfDay
  );
}

/** The acquisition time of an instance in seconds, from the first source it has. */
function acquisitionSeconds(instance: NaturalizedInstance): number | undefined {
  const dateTime = readOwn(instance, 'AcquisitionDateTime');
  if (dateTime != null && String(dateTime).length > 8) {
    const text = String(dateTime);
    return dicomDateTimeToSeconds(text.slice(0, 8), text.slice(8));
  }
  for (const [date, time] of [
    ['AcquisitionDate', 'AcquisitionTime'],
    ['ContentDate', 'ContentTime'],
  ]) {
    const seconds = dicomDateTimeToSeconds(
      readOwn(instance, date),
      readOwn(instance, time)
    );
    if (seconds !== undefined) {
      return seconds;
    }
  }
  return undefined;
}

/** The summary that {@link timeClusters} returns. */
export type TimeClusters = {
  /** The acquisition time of each timed instance, in seconds. */
  time: Record<string, number>;
  /** The time of the first instance of the cluster of each timed instance. */
  start: Record<string, number>;
  /** The earliest time in the series, or undefined when no instance has a time. */
  first?: number;
  /** The number of clusters. */
  clusters: number;
  /** Instances without a time. */
  untimedCount: number;
};

/**
 * Groups the instances of a series into clusters of contiguous acquisition
 * time. Ordered by time (a tie goes to the smaller key), a gap of more than
 * `args.maxGap` seconds (default 30) starts a new cluster.
 *
 * The time comes from `AcquisitionDateTime`, else `AcquisitionDate` and
 * `AcquisitionTime`, else `ContentDate` and `ContentTime`.
 *
 * A cluster is identified by its start time, not by its ordinal, so that the
 * split key of a cluster stays the same when a later cluster gets instances.
 */
export const timeClusters: SeriesFunction = (instances, { args }) => {
  const maxGap = numberArg(args, 'maxGap', 30);
  const result: TimeClusters = {
    time: {},
    start: {},
    clusters: 0,
    untimedCount: 0,
  };
  const timed: { key: string; seconds: number }[] = [];
  for (const instance of instances) {
    const key = instanceKey(instance);
    const seconds = acquisitionSeconds(instance);
    if (key === undefined || seconds === undefined) {
      result.untimedCount++;
      continue;
    }
    timed.push({ key, seconds });
    result.time[key] = seconds;
  }
  timed.sort(
    (a, b) =>
      a.seconds - b.seconds || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );

  let start: number | undefined;
  let previous: number | undefined;
  for (const { key, seconds } of timed) {
    if (previous === undefined || seconds - previous > maxGap) {
      start = seconds;
      result.clusters++;
    }
    result.start[key] = start as number;
    previous = seconds;
  }
  result.first = timed[0]?.seconds;
  return result;
};

/**
 * The built-in series functions, by name. An application adds its own, or
 * replaces one, through `CreateDisplaySetSplitRulesOptions.seriesFunctions`.
 */
export const BUILT_IN_SERIES_FUNCTIONS: Readonly<
  Record<string, SeriesFunction>
> = Object.freeze({ planeGeometry, timeClusters });
