import type { Types as ToolTypes } from '@cornerstonejs/tools';

export default function getStructureSetModule(
  contour: ToolTypes.Annotation,
  segment
) {
  const { FrameOfReferenceUID } = contour.metadata;

  return {
    ROINumber: segment.segmentIndex,
    ROIName: segment.label,
    ROIDescription: segment.label,
    ROIGenerationAlgorithm: 'MANUAL',
    ReferencedFrameOfReferenceUID: FrameOfReferenceUID,
  };
}
