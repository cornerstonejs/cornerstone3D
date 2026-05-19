import { BaseDisplaySet } from './BaseDisplaySet';
import { ImageStackDisplaySet } from './ImageStackDisplaySet';
import { isEcgInstance } from './isEcgInstance';
import { isVideoInstance } from './isVideoInstance';
import type { IDisplaySet } from './IDisplaySet';
import type { GroupedInstanceBucket } from './types';
import { getViewportTypesForGroup } from './viewportTypes';

export type CreateDisplaySetFromGroupOptions = {
  displaySetInstanceUID?: string;
  frameImageIds?: Iterable<string>;
};

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
  if (first && (isVideoInstance(first) || isEcgInstance(first))) {
    return new BaseDisplaySet({
      displaySetInstanceUID,
      viewportTypes,
      frameImageIds:
        options.frameImageIds ??
        instances.map((i) => i.imageId).filter(Boolean),
      underlyingImageIds: instances.map((i) => i.imageId).filter(Boolean),
    });
  }

  return ImageStackDisplaySet.fromInstances(instances, {
    displaySetInstanceUID,
    viewportTypes,
    frameImageIds: options.frameImageIds,
  });
}
