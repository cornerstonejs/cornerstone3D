import { BaseDisplaySet } from './BaseDisplaySet';
import { ImageStackDisplaySet } from './ImageStackDisplaySet';
import { isEcgInstance } from './isEcgInstance';
import { isVideoInstance } from './isVideoInstance';
import { isWsiInstance } from './isWsiInstance';
import type { IDisplaySet } from './IDisplaySet';
import type { GroupedInstanceBucket, ViewportTypeHint } from './types';
import {
  getPreferredViewportType,
  getViewportTypesForGroup,
} from './viewportTypes';

export type CreateDisplaySetFromGroupOptions = {
  displaySetInstanceUID?: string;
  imageIds?: Iterable<string>;
  /** 0-based index of this group among the series' split groups. */
  splitNumber?: number;
  descriptionName?: string;
};

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

/**
 * Runs the matched rule's `customAttributes` (if any) and spreads the returned
 * attributes flat onto the display set (shared attributes are declared on
 * IDisplaySet). A `viewportTypes` key in the returned attributes overrides the
 * rule's default viewport types; `preferredViewportType` is kept in sync
 * afterwards. Keys backed by a read-only accessor on the display set are skipped
 * rather than overridden.
 */
function applyCustomAttributes(
  displaySet: IDisplaySet,
  group: GroupedInstanceBucket,
  viewportTypes: readonly ViewportTypeHint[],
  options: CreateDisplaySetFromGroupOptions
): void {
  const { instances, matchedRule } = group;
  const first = instances[0];
  if (!matchedRule.customAttributes || !first) {
    return;
  }

  const sopClassUids = [
    ...new Set(instances.map((i) => i.SOPClassUID).filter(Boolean)),
  ];
  const isMultiFrame = Number(first.NumberOfFrames) > 1;

  const attributes = matchedRule.customAttributes(
    { instance: first, isMultiFrame, sopClassUids, viewportTypes },
    {
      instances,
      splitNumber: options.splitNumber,
      descriptionName: options.descriptionName,
    }
  );

  if (!attributes) {
    return;
  }

  for (const [key, value] of Object.entries(attributes)) {
    if (isAssignable(displaySet, key)) {
      (displaySet as unknown as Record<string, unknown>)[key] = value;
    }
  }

  // Keep the preferred viewport attribute consistent if customAttributes
  // overrode the allowed viewport types.
  displaySet.preferredViewportType = getPreferredViewportType(
    displaySet.viewportTypes
  );
}

/**
 * Builds cornerstone display set metadata for a grouped instance bucket.
 */
export function createDisplaySetFromGroup(
  group: GroupedInstanceBucket,
  options: CreateDisplaySetFromGroupOptions = {}
): IDisplaySet {
  const viewportTypes = getViewportTypesForGroup(group);
  const { instances } = group;
  const displaySetInstanceUID =
    options.displaySetInstanceUID ??
    instances[0]?.SeriesInstanceUID ??
    `display-set-${instances[0]?.imageId ?? 'unknown'}`;

  const first = instances[0];
  let displaySet: IDisplaySet;

  if (
    first &&
    (isVideoInstance(first) || isEcgInstance(first) || isWsiInstance(first))
  ) {
    const imageIds = instances.map((i) => i.imageId).filter(Boolean);
    displaySet = new BaseDisplaySet({
      displaySetInstanceUID,
      viewportTypes,
      instances,
      imageIds: options.imageIds ?? imageIds,
      underlyingImageIds: imageIds,
    });
  } else {
    displaySet = ImageStackDisplaySet.fromInstances(instances, {
      displaySetInstanceUID,
      viewportTypes,
      imageIds: options.imageIds,
    });
  }

  applyCustomAttributes(displaySet, group, viewportTypes, options);

  return displaySet;
}
