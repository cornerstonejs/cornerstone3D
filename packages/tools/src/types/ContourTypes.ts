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
  /** dash style of the outline when segmentation is active */
  outlineDashActive?: string;
  /** dash style of the outline when segmentation is inactive */
  outlineDashInactive?: string;
  /** outline visibility */
  renderOutline?: boolean;
  /** render fill */
  renderFill?: boolean;
  /** fill alpha */
  fillAlpha?: number;
  /** fillAlphaInactive */
  fillAlphaInactive?: number;
};

/**
 * Labelmap representation type
 */
export type ContourRenderingConfig = {
  // not much here yet
};

export type ContourSegmentationData = {
  // Ids of the contourSets that are part of this segmentation
  // in the cache
  geometryIds?: string[];
  // Ids of the annotations that are part of this segmentation
  // grouped by segmentIndex
  annotationUIDsMap?: Map<number, Set<string>>;
};
