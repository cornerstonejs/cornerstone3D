import { utilities } from '@cornerstonejs/core';
/**
 * Active labelmap style properties
 */
export type BaseLabelmapStyle = {
  /** whether to render segmentation outline */
  renderOutline?: boolean;
  /** thickness of the outline when segmentation is active - all segments */
  outlineWidth?: number;
  /** delta thickness of the active segment index outline (0 means same thickness,
   * 1 means 1px thicker, -1 means 1px thinner) */
  activeSegmentOutlineWidthDelta?: number;
  /** whether to render segmentation filling */
  renderFill?: boolean;
  /** alpha of the fill */
  fillAlpha?: number;
  /** alpha of outline for active segmentation */
  outlineOpacity?: number;
};

/**
 * Inactive labelmap style properties
 */
export type InactiveLabelmapStyle = {
  /** whether to render segmentation outline when inactive */
  renderOutlineInactive?: boolean;
  /** thickness of the outline when segmentation is inactive - all segments */
  outlineWidthInactive?: number;
  /** whether to render segmentation filling when inactive */
  renderFillInactive?: boolean;
  /** alpha of the fill when inactive */
  fillAlphaInactive?: number;
  /** alpha of outline for inactive segmentation */
  outlineOpacityInactive?: number;
};

/**
 * Combined labelmap style for both active and inactive states
 */
export type LabelmapStyle = BaseLabelmapStyle & InactiveLabelmapStyle;

export type LabelmapSegmentationDataVolume = {
  /**
   * Array of volumeIds for overlapping segmentations. If present, use this instead of volumeId.
   */
  volumeIds?: string[];
  volumeId?: string[];
  referencedVolumeId?: string;
};

export type LabelmapSegmentationDataStack = {
  /**
   * Flat array of imageIds associated with this segmentation.
   * For single volume: imageIds.length === numberOfImages.
   * For multi-volume: imageIds.length = numberOfVolumes * numberOfImages.
   * The images for each volume are contiguous in the array.
   * Use getImageIdsForVolume to extract per-volume imageIds.
   */
  imageIds: string[];
  /**
   * Number of images per volume. For multi-volume, total volumes = imageIds.length / numberOfImages.
   */
};
/**
 * Utility to get the imageIds for a specific volume from a flat imageIds array.
 * @param imageIds - Flat array of imageIds (all volumes concatenated)
 * @param volumeIndex - Index of the volume to extract (0-based)
 * @returns string[] - The imageIds for the specified volume
 */
export function getImageIdsForVolume(
  imageIds: string[],
  volumeIndex: number
): string[] {
  const numberOfImages = utilities.getNumberOfReferenceImageIds(imageIds);
  const start = volumeIndex * numberOfImages;
  return imageIds.slice(start, start + numberOfImages);
}

export type LabelmapSegmentationData =
  | LabelmapSegmentationDataVolume
  | LabelmapSegmentationDataStack
  // PolySeg version that has both
  | {
      referencedVolumeId?: string;
      referencedImageIds?: string[];
      imageIds?: string[];
    };

/**
 * Utility to get all volumeIds from a LabelmapSegmentationDataVolume, supporting both legacy and new format.
 */
export function getVolumeIds(
  labelmap: LabelmapSegmentationDataVolume
): string[] {
  if (Array.isArray(labelmap.volumeIds) && labelmap.volumeIds.length > 0) {
    return labelmap.volumeIds;
  }
  return [];
}

/**
 * Utility to get the primary volumeId from a LabelmapSegmentationDataVolume, supporting both legacy and new format.
 */
export function getPrimaryVolumeId(
  labelmap: LabelmapSegmentationDataVolume
): string | undefined {
  if (Array.isArray(labelmap.volumeIds) && labelmap.volumeIds.length > 0) {
    return labelmap.volumeIds[0];
  }
}

/**
 * Utility to get the referenced volumeId from a LabelmapSegmentationDataVolume, if it exists.
 * This is used for cases where the segmentation references another volume.
 * Returns undefined if no referencedVolumeId is set.
 * @param labelmap - The labelmap segmentation data to check.
 * @returns string | undefined - The referenced volumeId or undefined if not set.
 */
export function getReferencedVolumeId(
  labelmap: LabelmapSegmentationDataVolume
): string | undefined {
  return labelmap.referencedVolumeId ? labelmap.referencedVolumeId : undefined;
}

/**
 * Adds a volumeId to the labelmap segmentation data, ensuring it is unique.
 * If volumeIds array does not exist, it will be created.
 * @param labelmap - The labelmap segmentation data to modify.
 * @param volumeId - The volumeId to add.
 */
export function addVolumeId(
  labelmap: LabelmapSegmentationDataVolume,
  volumeId: string
) {
  if (!volumeId) {
    console.log('VolumeId cannot be null or undefined');
    return;
  }
  if (!labelmap.volumeIds) {
    labelmap.volumeIds = [];
  }
  if (!labelmap.volumeIds.includes(volumeId)) {
    labelmap.volumeIds.push(volumeId);
  }
}

/**
 * Replaces an existing volumeId in the labelmap segmentation data with a new one.
 * If the oldVolumeId does not exist, no changes are made.
 * @param labelmap - The labelmap segmentation data to modify.
 * @param oldVolumeId - The volumeId to replace.
 * @param newVolumeId - The new volumeId to set.
 */
export function replaceVolumeId(
  labelmap: LabelmapSegmentationDataVolume,
  oldVolumeId: string,
  newVolumeId: string
) {
  if (Array.isArray(labelmap.volumeIds)) {
    const index = labelmap.volumeIds.indexOf(oldVolumeId);
    if (index !== -1) {
      labelmap.volumeIds[index] = newVolumeId;
    }
  }
}
