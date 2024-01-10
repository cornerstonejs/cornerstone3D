import { SegmentationRepresentations } from '../../../enums';
import {
  SegmentationPublicInput,
  Segmentation,
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
  const { segmentationId, representation } = segmentationInput;
  const isContourRepresentation =
    representation.type === SegmentationRepresentations.Contour;
  let data = representation.data ? { ...representation.data } : null;

  // Contour representation data is defined internally
  data = !data && isContourRepresentation ? {} : data;

  // Data cannot be undefined for labelmap and surface
  if (!data) {
    throw new Error('Segmentation representation data may not be undefined');
  }

  if (isContourRepresentation) {
    const contourData = <ContourSegmentationData>data;

    // geometryIds will be removed in a near future. It still exist in the
    // code for compatibility only but it is optional from now on.
    contourData.geometryIds = contourData.geometryIds ?? [];

    // Make sure annotationUIDsMap is defined because an empty contour is
    // created before adding contour annotations to the map. Also it prevents
    // breaking legacy code after moving from geometryIds to annotationUIDsMap.
    contourData.annotationUIDsMap = contourData.annotationUIDsMap ?? new Map();
  }

  // Todo: we should be able to let the user pass in non-default values for
  // cachedStats, label, activeSegmentIndex, etc.
  return {
    segmentationId,
    cachedStats: {},
    segmentLabels: {},
    label: null,
    segmentsLocked: new Set(),
    type: representation.type,
    activeSegmentIndex: 1,
    representationData: {
      [representation.type]: {
        ...data,
      },
    },
  };
}

export default normalizeSegmentationInput;
