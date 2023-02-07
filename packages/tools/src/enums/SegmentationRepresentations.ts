/**
 * Segmentations on viewports can be visualized in different ways. This enum
 * defines the different ways of visualizing segmentations. Currently, only
 * labelmap is supported.
 */
enum SegmentationRepresentations {
  Labelmap = 'LABELMAP',
  Contour = 'CONTOUR',
  // Todo: add more representations
}

export default SegmentationRepresentations;
