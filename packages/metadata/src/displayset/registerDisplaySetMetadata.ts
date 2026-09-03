import { MetadataModules } from '../enums';
import { addTyped } from '../metaData';
import type { IDisplaySet } from './IDisplaySet';

export type RegisterDisplaySetMetadataOptions = {
  /** Register on frame-level imageIds in addition to underlying ids. */
  includeImageIds?: boolean;
};

/**
 * Stores display set metadata in the typed metadata cache via addTyped.
 */
export function registerDisplaySetMetadata(
  imageIds: string[],
  displaySet: IDisplaySet,
  options: RegisterDisplaySetMetadataOptions = {}
): void {
  const idsToRegister = new Set<string>(imageIds);

  if (options.includeImageIds) {
    for (const frameId of displaySet.imageIds) {
      idsToRegister.add(frameId);
    }
  }

  for (const underlyingId of displaySet.underlyingImageIds) {
    idsToRegister.add(underlyingId);
  }

  for (const imageId of idsToRegister) {
    if (!imageId) {
      continue;
    }
    addTyped(MetadataModules.DISPLAY_SET, imageId, { displaySet });
  }
}
