/**
 * The default instance order of a split, in the comparator pattern of OHIF
 * `sortStudy.ts`: a null-safe {@link compare} of one value, and comparators
 * that compare one key and fall back to the next comparator with `||`. Each
 * comparator has the signature of `SplitRule.compareInstances`, and passes
 * `context` down the chain.
 *
 * @module displayset/sortInstances
 */

import { toFiniteFirst } from '@cornerstonejs/utils';
import type { NaturalizedInstance, RuleContext } from './types';

/**
 * Compares two values: equal (`==`) is 0, and a value with no truth (absent,
 * `''`, `0`) sorts before a value with one. Else `<` decides.
 */
export function compare(a: unknown, b: unknown): number {
  if (a == b) {
    return 0;
  }
  if (!a && b) {
    return -1;
  }
  if (!b && a) {
    return 1;
  }
  return (a as string) < (b as string) ? -1 : 1;
}

/**
 * Compares by `SOPInstanceUID`, else `imageId`, as text. The last step of the
 * default order, so the order is total.
 */
export function compareSOPInstanceUID(
  a: NaturalizedInstance,
  b: NaturalizedInstance,
  _context?: RuleContext
): number {
  return compare(
    String(a.SOPInstanceUID ?? a.imageId ?? ''),
    String(b.SOPInstanceUID ?? b.imageId ?? '')
  );
}

/**
 * Compares by `InstanceNumber` only; 0 when the numbers are equal, or when
 * both are absent. An absent or non-numeric `InstanceNumber` sorts after the
 * numbered instances, and does not alias to 0 (`toFiniteFirst`, not `Number`).
 */
export function compareInstanceNumber(
  a: NaturalizedInstance,
  b: NaturalizedInstance,
  _context?: RuleContext
): number {
  const aNumber = toFiniteFirst(a.InstanceNumber);
  const bNumber = toFiniteFirst(b.InstanceNumber);
  return aNumber !== undefined && bNumber !== undefined
    ? aNumber - bNumber
    : Number(aNumber === undefined) - Number(bNumber === undefined);
}

/**
 * The default instance order: {@link compareInstanceNumber}, then
 * {@link compareSOPInstanceUID}. `context` goes down the chain.
 */
export function sortByInstanceNumber(
  a: NaturalizedInstance,
  b: NaturalizedInstance,
  context?: RuleContext
): number {
  return (
    compareInstanceNumber(a, b, context) || compareSOPInstanceUID(a, b, context)
  );
}

/** The instance sort criteria, as in OHIF `sortStudy.ts`. */
export const instancesSortCriteria = {
  default: sortByInstanceNumber,
  sortByInstanceNumber,
};

/**
 * Returns a sorted COPY of `instances`; the input array does not change. (OHIF
 * `sortStudyInstances` sorts in place; a split must not change the caller's
 * array.) A host gives its own comparator chain as `criteria`, and `context`
 * goes to each call of it.
 */
export function sortInstancesCopy<T extends NaturalizedInstance>(
  instances: readonly T[],
  criteria: (
    a: NaturalizedInstance,
    b: NaturalizedInstance,
    context?: RuleContext
  ) => number = instancesSortCriteria.default,
  context?: RuleContext
): T[] {
  return [...instances].sort((a, b) => criteria(a, b, context));
}
