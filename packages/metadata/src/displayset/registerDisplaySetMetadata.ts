import { writeDisplaySet } from './displaySetRegistry';
import type { IDisplaySet } from './IDisplaySet';

export type RegisterDisplaySetMetadataOptions = {
  /** Register on frame-level imageIds in addition to underlying ids. */
  includeImageIds?: boolean;
};

/**
 * Registers a display set in `displaySetRegistry` under its `displaySetId`,
 * and stores it in the `DISPLAY_SET` module under its image ids too: the ids
 * of `imageIds`, its underlying image ids, and its frame image ids with
 * `includeImageIds`. A viewport finds the display set by its `displaySetId`;
 * an image id finds it through `metaData.get(MetadataModules.DISPLAY_SET,
 * imageId)`. An image id that is itself a display set id keeps its display
 * set. Registering it again replaces the image ids of the earlier
 * registration, and `displaySetRegistry.remove(displaySetId)` removes them
 * all.
 */
export function registerDisplaySetMetadata(
  imageIds: string[],
  displaySet: IDisplaySet,
  options: RegisterDisplaySetMetadataOptions = {}
): void {
  const aliasIds = new Set<string>(imageIds);

  if (options.includeImageIds) {
    for (const frameId of displaySet.imageIds) {
      aliasIds.add(frameId);
    }
  }

  for (const underlyingId of displaySet.underlyingImageIds) {
    aliasIds.add(underlyingId);
  }

  writeDisplaySet(displaySet.displaySetId, displaySet, aliasIds);
}
