import { SegmentationRepresentations } from '../../../enums';
import type {
  SegmentationPublicInput,
  Segmentation,
  Segment,
  RepresentationData,
} from '../../../types/SegmentationStateTypes';
import type { ContourSegmentationData } from '../../../types/ContourTypes';
import { cache } from '@cornerstonejs/core';
import type { SurfaceSegmentationData } from '../../../types/SurfaceTypes';

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

  if (!data) {
    throw new Error('Segmentation representation data may not be undefined');
  }

  if (type === SegmentationRepresentations.Contour) {
    normalizeContourData(data as ContourSegmentationData);
  }
  const normalizedSegments = normalizeSegments(config?.segments, type, data);

  return {
    segmentationId,
    label: config?.label ?? null,
    cachedStats: config?.cachedStats ?? {},
    segments: normalizedSegments,
    representationData: {
      [type]: {
        ...data,
      },
    },
  };
}

/**
 * Normalize contour segmentation data to ensure compatibility and default values.
 * @param contourData - ContourSegmentationData to be normalized.
 */
function normalizeContourData(contourData: ContourSegmentationData): void {
  contourData.geometryIds = contourData.geometryIds ?? [];
  contourData.annotationUIDsMap = contourData.annotationUIDsMap ?? new Map();
}

/**
 * Normalize segments based on the segmentation type and provided configuration.
 * @param segmentsConfig - Configured segments, if any.
 * @param type - Segmentation representation type.
 * @param data - Representation data used for segment creation if needed.
 * @returns A normalized segments object.
 */
function normalizeSegments(
  segmentsConfig: { [key: number]: Partial<Segment> } | undefined,
  type: SegmentationRepresentations,
  data: RepresentationData
): { [key: number]: Segment } {
  const normalizedSegments: { [key: number]: Segment } = {};

  if (segmentsConfig) {
    Object.entries(segmentsConfig).forEach(([segmentIndex, segment]) => {
      normalizedSegments[segmentIndex] = {
        segmentIndex: Number(segmentIndex),
        label: segment.label ?? `Segment ${segmentIndex}`,
        locked: segment.locked ?? false,
        cachedStats: segment.cachedStats ?? {},
        active: segment.active ?? false,
      } as Segment;
    });
  } else if (type === SegmentationRepresentations.Surface) {
    normalizeSurfaceSegments(
      normalizedSegments,
      data as SurfaceSegmentationData
    );
  } else {
    normalizedSegments[1] = createDefaultSegment();
  }

  return normalizedSegments;
}

/**
 * Normalize surface segmentation segments using geometry data from cache.
 * @param normalizedSegments - The object to store normalized segments.
 * @param surfaceData - SurfaceSegmentationData to extract geometry information.
 */
function normalizeSurfaceSegments(
  normalizedSegments: { [key: number]: Segment },
  surfaceData: SurfaceSegmentationData
): void {
  const { geometryIds } = surfaceData;
  geometryIds.forEach((geometryId) => {
    const geometry = cache.getGeometry(geometryId);
    if (geometry?.data) {
      const { segmentIndex } = geometry.data;
      normalizedSegments[segmentIndex] = { segmentIndex } as Segment;
    }
  });
}

/**
 * Create a default labelmap segment.
 * @returns A default Segment object for Labelmap representation.
 */
function createDefaultSegment(): Segment {
  return {
    segmentIndex: 1,
    label: 'Segment 1',
    locked: false,
    cachedStats: {},
    active: true,
  } as Segment;
}

export default normalizeSegmentationInput;
