export default function getStructureSetModule(contour, segment) {
  const { FrameOfReferenceUID } = contour.metadata;

  return {
    ROINumber: segment.segmentIndex,
    ROIName: segment.label,
    ROIDescription: segment.label,
    ROIGenerationAlgorithm: 'MANUAL',
    ReferencedFrameOfReferenceUID: FrameOfReferenceUID,
  };
}
