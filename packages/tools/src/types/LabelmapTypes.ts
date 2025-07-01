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
   * Single volumeId for backward compatibility. If multiple segmentations overlap,
   * use volumeIds instead. If both are present, volumeIds takes precedence.
   */
  volumeId?: string;
  /**
   * Array of volumeIds for overlapping segmentations. If present, use this instead of volumeId.
   */
  volumeIds?: string[];
  referencedVolumeId?: string;
};

export type LabelmapSegmentationDataStack = {
  /**
   * array of imageIds that are associated with this segmentation
   * for each slice or for each volume (if multiple volumes)
   * Can be a flat array (single volume) or an array of arrays (multi-volume).
   */
  imageIds: string[] | string[][];
};

export type LabelmapSegmentationData =
  | LabelmapSegmentationDataVolume
  | LabelmapSegmentationDataStack
  // PolySeg version that has both
  | {
      volumeId?: string;
      referencedVolumeId?: string;
      referencedImageIds?: string[];
      imageIds?: string[] | string[][];
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
  if (labelmap.volumeId) {
    return [labelmap.volumeId];
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
  return labelmap.volumeId;
}
