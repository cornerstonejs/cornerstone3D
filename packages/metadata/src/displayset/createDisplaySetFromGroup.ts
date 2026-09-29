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
  isDisplayableViewportTypes,
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
 * Runs the matched rule's `customAttributes` (if any) and returns the
 * attributes it produces. Runs before the display set exists, because a
 * `viewportTypes` key in the result decides which class the display set is.
 */
function runCustomAttributes(
  group: InstanceGroup,
  viewportTypes: readonly ViewportTypeHint[],
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
      { instance: first, isMultiFrame, sopClassUids, viewportTypes },
      {
        instances,
        splitNumber: options.splitNumber,
        descriptionName: options.descriptionName,
      }
    ) ?? undefined
  );
}

/**
 * The viewport types the display set gets: a `viewportTypes` array in the
 * custom attributes wins over the rule's own.
 */
function resolveViewportTypes(
  ruleViewportTypes: readonly ViewportTypeHint[],
  attributes: Record<string, unknown> | undefined
): readonly ViewportTypeHint[] {
  const override = attributes?.viewportTypes;
  return Array.isArray(override)
    ? (override as ViewportTypeHint[])
    : ruleViewportTypes;
}

/**
 * Spreads the custom attributes flat onto the display set (shared attributes
 * are declared on IDisplaySet). `viewportTypes` is skipped, because the display
 * set was already built with the resolved viewport types. Reserved data fields
 * (see {@link RESERVED_ATTRIBUTE_KEYS}) and keys backed by a read-only accessor
 * on the display set are skipped rather than overridden. The attributes that
 * derive from `viewportTypes` are set again at the end, so a custom attribute
 * cannot make `isDisplayable` disagree with the class and its `imageIds`.
 */
function applyCustomAttributes(
  displaySet: IDisplaySet,
  attributes: Record<string, unknown> | undefined
): void {
  if (!attributes) {
    return;
  }

  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'viewportTypes' || RESERVED_ATTRIBUTE_KEYS.has(key)) {
      continue;
    }
    if (isAssignable(displaySet, key)) {
      (displaySet as unknown as Record<string, unknown>)[key] = value;
    }
  }

  displaySet.preferredViewportType = getPreferredViewportType(
    displaySet.viewportTypes
  );
  displaySet.isDisplayable = isDisplayableViewportTypes(
    displaySet.viewportTypes
  );
}

/**
 * Builds cornerstone display set metadata for an instance group.
 *
 * The order matters: the rule's `customAttributes` run first, then the
 * effective viewport types are resolved (a `viewportTypes` key in the returned
 * attributes wins), then the display set class is chosen from those viewport
 * types, and last the remaining attributes are applied. So a rule whose custom
 * attributes make a group non-displayable gets the non-displayable shape (empty
 * `imageIds`), and the reverse.
 */
export function createDisplaySetFromGroup(
  group: InstanceGroup,
  options: CreateDisplaySetFromGroupOptions = {}
): IDisplaySet {
  const ruleViewportTypes = getViewportTypesForGroup(group);
  const attributes = runCustomAttributes(group, ruleViewportTypes, options);
  const viewportTypes = resolveViewportTypes(ruleViewportTypes, attributes);
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

  if (!isDisplayableViewportTypes(viewportTypes)) {
    // Nothing can render this (the catch-all `unsupported` rule claimed it), so
    // build the plain base shape rather than an image stack: an ImageStack would
    // advertise frame-level `imageIds` for an object that has no frames. The
    // SOP-level ids are still kept as `underlyingImageIds` so the display set
    // remains resolvable from the instance's imageId, while the empty `imageIds`
    // means anything that ignores `isDisplayable` renders nothing rather than
    // something broken.
    const underlyingImageIds = instances
      .map((i) => i.imageId)
      .filter(Boolean) as string[];
    displaySet = new BaseDisplaySet({
      displaySetId,
      viewportTypes,
      instances,
      imageIds: [],
      underlyingImageIds,
    });
  } else if (
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

  applyCustomAttributes(displaySet, attributes);

  return displaySet;
}
