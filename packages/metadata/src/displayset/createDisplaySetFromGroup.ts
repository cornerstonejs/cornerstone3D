import { BaseDisplaySet } from './BaseDisplaySet';
import { ImageStackDisplaySet } from './ImageStackDisplaySet';
import { isUnsafeKey } from '../safeFunctions/schema';
import type { IDisplaySet } from './IDisplaySet';
import { isVolumeInstances } from './isVolumeInstances';
import type { InstanceGroup } from './types';

export type CreateDisplaySetFromGroupOptions = {
  displaySetId?: string;
  imageIds?: Iterable<string>;
  /** 0-based index of this group among the series' split groups. */
  splitNumber?: number;
  descriptionName?: string;
};

/**
 * Resolved data fields that custom attributes must never overwrite. They are
 * declared `readonly` on the display set, but `readonly` is erased at runtime,
 * so the constructor-assigned fields stay writable - a consumer split rule
 * returning e.g. `{ imageIds: [...] }` would otherwise clobber the resolved ids
 * and break the underlying-vs-frame invariant the viewports rely on.
 */
const RESERVED_ATTRIBUTE_KEYS = new Set<string>([
  'imageIds',
  'underlyingImageIds',
  'instances',
  'displaySetId',
  // The identity of the split: a rule must not rename it.
  'splitKey',
  'splitRuleId',
  'splitGroupId',
  // The handler decides these; an attribute must not contradict the class.
  'handler',
  'isDisplayable',
]);

/**
 * Returns true unless `key` resolves to a read-only accessor (getter without a
 * setter) somewhere on the display set's prototype chain, so custom attributes
 * never clobber a computed getter.
 */
function isAssignable(target: object, key: string): boolean {
  let obj: object | null = target;
  while (obj) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, key);
    if (descriptor) {
      if (descriptor.get || descriptor.set) {
        return typeof descriptor.set === 'function';
      }
      return descriptor.writable !== false;
    }
    obj = Object.getPrototypeOf(obj);
  }
  return true;
}

/** Runs the matched rule's `customAttributes` (if any). */
function runCustomAttributes(
  group: InstanceGroup,
  options: CreateDisplaySetFromGroupOptions
): Record<string, unknown> | undefined {
  const { instances, matchedRule } = group;
  const first = instances[0];
  if (!matchedRule.customAttributes || !first) {
    return undefined;
  }

  const sopClassUids = [
    ...new Set(instances.map((i) => i.SOPClassUID).filter(Boolean)),
  ];
  const isMultiFrame = Number(first.NumberOfFrames) > 1;

  return (
    matchedRule.customAttributes(
      { instance: first, isMultiFrame, sopClassUids },
      {
        instances,
        splitNumber: options.splitNumber,
        descriptionName: options.descriptionName,
        // The values of the whole series, so that an attribute such as a
        // slice spacing is the same for each display set of the series.
        series: group.series,
      }
    ) ?? undefined
  );
}

/**
 * Spreads the custom attributes flat onto the display set (shared attributes
 * are declared on IDisplaySet). Reserved data fields (see
 * {@link RESERVED_ATTRIBUTE_KEYS}) and keys backed by a read-only accessor on
 * the display set are skipped rather than overridden.
 */
function applyCustomAttributes(
  displaySet: IDisplaySet,
  attributes: Record<string, unknown> | undefined
): void {
  if (!attributes) {
    return;
  }

  for (const [key, value] of Object.entries(attributes)) {
    // A `__proto__` key (a real own key from `JSON.parse` or `Object.fromEntries`)
    // would replace the prototype of the display set.
    if (RESERVED_ATTRIBUTE_KEYS.has(key) || isUnsafeKey(key)) {
      continue;
    }
    if (isAssignable(displaySet, key)) {
      (displaySet as unknown as Record<string, unknown>)[key] = value;
    }
  }
}

/**
 * Builds cornerstone display set metadata for an instance group.
 *
 * The `handler` of the matched rule decides the class and `isDisplayable`:
 *
 * - no handler, or `image`: an `ImageStackDisplaySet`;
 * - `unsupported`: a `BaseDisplaySet` that is not displayable. `imageIds` is
 *   empty, so code that ignores `isDisplayable` renders nothing, and
 *   `underlyingImageIds` keeps the SOP-level ids, so the display set stays
 *   resolvable from an imageId;
 * - any other handler: a displayable `BaseDisplaySet`; the handler of the host
 *   builds the rest.
 *
 * An image display set also gets `isVolume` (see {@link isVolumeInstances}):
 * the host opens it as a volume when it is true. The host chooses the viewport
 * from `handler` and `isVolume`; a rule's `viewportTypes` is copied as data.
 *
 * The default `displaySetId` is the SeriesInstanceUID plus a non-zero
 * `splitNumber`, so the display sets of one split series stay unique. Callers
 * pass the same id to a viewport.
 */
export function createDisplaySetFromGroup(
  group: InstanceGroup,
  options: CreateDisplaySetFromGroupOptions = {}
): IDisplaySet {
  const attributes = runCustomAttributes(group, options);
  const { instances } = group;
  // The default id holds the `splitNumber`, so each split of a series is unique.
  const baseDisplaySetId =
    instances[0]?.SeriesInstanceUID ??
    `display-set-${instances[0]?.imageId ?? 'unknown'}`;
  const displaySetId =
    options.displaySetId ??
    (options.splitNumber
      ? `${baseDisplaySetId}:${options.splitNumber}`
      : baseDisplaySetId);

  const first = instances[0];
  const { handler } = group.matchedRule;
  const underlyingImageIds = instances
    .map((i) => i.imageId)
    .filter(Boolean) as string[];
  let displaySet: IDisplaySet;

  if (handler === 'unsupported') {
    // Nothing can render this: the base shape, with no frame-level imageIds.
    displaySet = new BaseDisplaySet({
      displaySetId,
      instances,
      imageIds: [],
      underlyingImageIds,
      isDisplayable: false,
    });
  } else if (handler !== undefined && handler !== 'image') {
    // Not an image stack: the handler of the host builds the rest.
    displaySet = new BaseDisplaySet({
      displaySetId,
      instances,
      imageIds: options.imageIds ?? underlyingImageIds,
      underlyingImageIds,
    });
  } else {
    displaySet = ImageStackDisplaySet.fromInstances(instances, {
      displaySetId,
      imageIds: options.imageIds,
    });
  }

  displaySet.splitKey = group.splitKey;
  displaySet.splitRuleId = group.matchedRule.id;
  displaySet.splitGroupId = group.matchedRule.groupId ?? group.matchedRule.id;
  if (handler !== undefined) {
    displaySet.handler = handler;
  }
  // Copied for the host; CS3D does not read it.
  if (group.matchedRule.viewportTypes !== undefined) {
    displaySet.viewportTypes = [...group.matchedRule.viewportTypes];
  }
  // Every display set carries these, so a rule does not ask for them.
  displaySet.sopClassUids = [
    ...new Set(instances.map((i) => i.SOPClassUID).filter(Boolean)),
  ] as string[];
  if (options.splitNumber !== undefined) {
    displaySet.splitNumber = options.splitNumber;
  }
  displaySet.isMultiFrame ??= Number(first?.NumberOfFrames) > 1;
  applyCustomAttributes(displaySet, attributes);
  // An image display set says if it can open as a volume; a clip cannot.
  // An attribute that sets isVolume wins.
  if (
    (handler === undefined || handler === 'image') &&
    typeof displaySet.isVolume !== 'boolean'
  ) {
    displaySet.isVolume = !displaySet.isClip && isVolumeInstances(instances);
  }

  return displaySet;
}
