/**
 * Label map config for the label map representation
 */
export type LabelmapStyle = {
  /** whether to render segmentation outline  */
  renderOutline?: boolean;
  /** thickness of the outline when segmentation is active - all segments */
  outlineWidthActive?: number;
  /** thickness of the outline when segmentation is inactive - all segments */
  outlineWidthInactive?: number;
  /** delta thickness of the active segment index outline (0 means same thickness,
   * 1 means 1px thicker, -1 means 1px thinner) */
  activeSegmentOutlineWidthDelta?: number;
  /** whether to render segmentation filling */
  renderFill?: boolean;
  /** whether to render segmentation filling when inactive */
  renderFillInactive?: boolean;
  /** alpha of the fill */
  fillAlpha?: number;
  /** alpha of the fill when inactive */
  fillAlphaInactive?: number;
  /** alpha of outline for active segmentation */
  outlineOpacity?: number;
  /** alpha of outline for inactive segmentation */
  outlineOpacityInactive?: number;
};

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
