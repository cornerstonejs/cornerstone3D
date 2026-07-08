import { BaseDisplaySet } from './BaseDisplaySet';
import { ImageStackDisplaySet } from './ImageStackDisplaySet';
import { isEcgInstance } from './isEcgInstance';
import { isVideoInstance } from './isVideoInstance';
import { isWsiInstance } from './isWsiInstance';
import type { IDisplaySet } from './IDisplaySet';
import type { InstanceGroup, ViewportTypeHint } from './types';
import {
  getPreferredViewportType,
  getViewportTypesForGroup,
} from './viewportTypes';

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

/**
 * Runs the matched rule's `customAttributes` (if any) and spreads the returned
 * attributes flat onto the display set (shared attributes are declared on
 * IDisplaySet). A `viewportTypes` key in the returned attributes overrides the
 * rule's default viewport types; `preferredViewportType` is kept in sync
 * afterwards. Reserved data fields (see {@link RESERVED_ATTRIBUTE_KEYS}) and
 * keys backed by a read-only accessor on the display set are skipped rather than
 * overridden.
 */
function applyCustomAttributes(
  displaySet: IDisplaySet,
  group: InstanceGroup,
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
    if (RESERVED_ATTRIBUTE_KEYS.has(key)) {
      continue;
    }
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
 * Builds cornerstone display set metadata for an instance group.
 */
export function createDisplaySetFromGroup(
  group: InstanceGroup,
  options: CreateDisplaySetFromGroupOptions = {}
): IDisplaySet {
  const viewportTypes = getViewportTypesForGroup(group);
  const { instances } = group;
  // A single series can split into multiple display sets (e.g. the DWI
  // mixed-b-value split), so the default id folds in the 0-based `splitNumber`
  // to stay unique within a series rather than collapsing every split to the
  // bare SeriesInstanceUID. This is the same value callers pass to a viewport as
  // `displaySetId` - the metadata id and the viewport/registry id are one.
  const baseDisplaySetId =
    instances[0]?.SeriesInstanceUID ??
    `display-set-${instances[0]?.imageId ?? 'unknown'}`;
  const displaySetId =
    options.displaySetId ??
    (options.splitNumber
      ? `${baseDisplaySetId}:${options.splitNumber}`
      : baseDisplaySetId);

  const first = instances[0];
  let displaySet: IDisplaySet;

  if (
    first &&
    (isVideoInstance(first) || isEcgInstance(first) || isWsiInstance(first))
  ) {
    const imageIds = instances.map((i) => i.imageId).filter(Boolean);
    displaySet = new BaseDisplaySet({
      displaySetId,
      viewportTypes,
      instances,
      imageIds: options.imageIds ?? imageIds,
      underlyingImageIds: imageIds,
    });
  } else {
    displaySet = ImageStackDisplaySet.fromInstances(instances, {
      displaySetId,
      viewportTypes,
      imageIds: options.imageIds,
    });
  }

  applyCustomAttributes(displaySet, group, viewportTypes, options);

  return displaySet;
}
