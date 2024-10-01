import { SegmentationRepresentations } from '../../../enums';
import type {
  SegmentationPublicInput,
  Segmentation,
  Segment,
} from '../../../types/SegmentationStateTypes';
import type { ContourSegmentationData } from '../../../types/ContourTypes';

/**
 * It takes in a segmentation input and returns a segmentation with default values
 * @param segmentationInput - The input to the segmentation.
 * @returns A Segmentation object.
 * @internal
 */
function normalizeSegmentationInput(
  segmentationInput: SegmentationPublicInput
): Segmentation {
  const { segmentationId, representation, config } = segmentationInput;
  const { type, data: inputData } = representation;
  const data = inputData ? { ...inputData } : {};

  // Data cannot be undefined for labelmap and surface
  if (!data) {
    throw new Error('Segmentation representation data may not be undefined');
  }
  if (type === SegmentationRepresentations.Contour) {
    const contourData = <ContourSegmentationData>data;

    // geometryIds will be removed in a near future. It still exist in the
    // code for compatibility only but it is optional from now on.
    contourData.geometryIds = contourData.geometryIds ?? [];

    // Make sure annotationUIDsMap is defined because an empty contour is
    // created before adding contour annotations to the map. Also it prevents
    // breaking legacy code after moving from geometryIds to annotationUIDsMap.
    contourData.annotationUIDsMap = contourData.annotationUIDsMap ?? new Map();
  }

  const normalizedSegments = {} as { [key: number]: Segment };

  Object.entries(config.segments).forEach(([segmentIndex, segment]) => {
    normalizedSegments[segmentIndex] = {
      segmentIndex: Number(segmentIndex),
      label: segment.label ?? `Segment ${segmentIndex}`,
      locked: segment.locked ?? false,
      cachedStats: segment.cachedStats ?? {},
      active: segment.active ?? false,
    } as Segment;
  });

  // Todo: we should be able to let the user pass in non-default values for
  // cachedStats, label, activeSegmentIndex, etc.
  return {
    segmentationId,
    label: config.label ?? null,
    segments: normalizedSegments,
    representationData: {
      [type]: {
        ...data,
      },
    },
  };
}

export default normalizeSegmentationInput;
