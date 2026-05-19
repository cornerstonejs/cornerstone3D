import { MetadataModules } from '../enums';
import { addTyped } from '../metaData';
import type { IDisplaySet } from './IDisplaySet';

export type RegisterDisplaySetMetadataOptions = {
  /** Register on frame ids in addition to underlying ids. */
  includeFrameImageIds?: boolean;
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

  if (options.includeFrameImageIds) {
    for (const frameId of displaySet.getFrameImageIds()) {
      idsToRegister.add(frameId);
    }
  }

  for (const underlyingId of displaySet.getUnderlyingImageIds()) {
    idsToRegister.add(underlyingId);
  }

  for (const imageId of idsToRegister) {
    if (!imageId) {
      continue;
    }
    addTyped(MetadataModules.DISPLAY_SET, imageId, { displaySet });
  }
}
