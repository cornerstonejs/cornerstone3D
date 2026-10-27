import { BaseDisplaySet } from './BaseDisplaySet';
import { ImageStackDisplaySet } from './ImageStackDisplaySet';
import { isEcgInstance } from './isEcgInstance';
import { isVideoInstance } from './isVideoInstance';
import { isWsiInstance } from './isWsiInstance';
import { isUnsafeKey } from '../safeFunctions/schema';
import type { DisplaySetContext } from './displaySetContext';
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
  /**
   * The metadata context of the video, ECG and whole slide tests. Defaults to
   * the context that the rule was compiled with, else the active context.
   */
  context?: DisplaySetContext;
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
  'handler',
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
        // The values of the whole series, so that an attribute such as a
        // slice spacing is the same for each display set of the series.
        series: group.series,
      }
    ) ?? undefined
  );
}

/**
 * The viewport types the display set gets: a `viewportTypes` array in the
 * custom attributes wins over the rule's own. An empty array is no override,
 * so the rule's types and their `['stack']` fallback apply.
 */
function resolveViewportTypes(
  ruleViewportTypes: readonly ViewportTypeHint[],
  attributes: Record<string, unknown> | undefined
): readonly ViewportTypeHint[] {
  const override = attributes?.viewportTypes;
  return Array.isArray(override) && override.length
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
    // A `__proto__` key (a real own key from `JSON.parse` or `Object.fromEntries`)
    // would replace the prototype of the display set.
    if (
      key === 'viewportTypes' ||
      RESERVED_ATTRIBUTE_KEYS.has(key) ||
      isUnsafeKey(key)
    ) {
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
 *
 * The default `displaySetId` is the SeriesInstanceUID plus a non-zero
 * `splitNumber`, so the display sets of one split series stay unique. Callers
 * pass the same id to a viewport. A non-displayable group gets a
 * `BaseDisplaySet`, not an ImageStack: `imageIds` is empty, so code that
 * ignores `isDisplayable` renders nothing, and `underlyingImageIds` keeps the
 * SOP-level ids, so the display set stays resolvable from an imageId.
 */
export function createDisplaySetFromGroup(
  group: InstanceGroup,
  options: CreateDisplaySetFromGroupOptions = {}
): IDisplaySet {
  const ruleViewportTypes = getViewportTypesForGroup(group);
  const attributes = runCustomAttributes(group, ruleViewportTypes, options);
  const viewportTypes = resolveViewportTypes(ruleViewportTypes, attributes);
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
  const context = options.context ?? group.matchedRule.metadataContext;
  let displaySet: IDisplaySet;

  if (!isDisplayableViewportTypes(viewportTypes)) {
    // Nothing can render this: build the base shape, with no frame-level imageIds.
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
    (handler !== undefined && handler !== 'image') ||
    (first &&
      (isVideoInstance(first, context) ||
        isEcgInstance(first, context) ||
        isWsiInstance(first, context)))
  ) {
    // Not an image stack: the handler of the host builds the rest.
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

  displaySet.splitKey = group.splitKey;
  displaySet.splitRuleId = group.matchedRule.id;
  displaySet.splitGroupId = group.matchedRule.groupId ?? group.matchedRule.id;
  if (handler !== undefined) {
    displaySet.handler = handler;
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

  return displaySet;
}
