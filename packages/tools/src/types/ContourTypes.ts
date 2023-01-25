/**
 * Label map config for the label map representation
 */
export type ContourConfig = {
  /** thickness of the outline when segmentation is active */
  outlineWidthActive?: number;
  /** thickness of the outline when segmentation is inactive */
  outlineWidthInactive?: number;
  /** alpha of outline for active segmentation */
  outlineOpacity?: number;
  /** alpha of outline for inactive segmentation */
  outlineOpacityInactive?: number;
};

/**
 * Labelmap representation type
 */
export type ContourRenderingConfig = {
  // not much here yet
};

export type ContourSegmentationData = {
  geometryId: string;
};
