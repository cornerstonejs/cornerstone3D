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
  volumeId: string;
  referencedVolumeId?: string;
};

export type LabelmapSegmentationDataStack = {
  /**
   * array of imageIds that are associated with this segmentation
   * for each slice
   */
  imageIds: string[];
};

export type LabelmapSegmentationData =
  | LabelmapSegmentationDataVolume
  | LabelmapSegmentationDataStack
  // PolySeg version that has both
  | {
      volumeId?: string;
      referencedVolumeId?: string;
      referencedImageIds?: string[];
      imageIds?: string[];
    };
