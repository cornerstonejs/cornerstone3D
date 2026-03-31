import type { Types } from '@cornerstonejs/core';
import { cache } from '@cornerstonejs/core';
import { SegmentationRepresentations } from '../../enums';
import { getCachedSegmentIndices, setCachedSegmentIndices } from './utilities';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';

/**
 * Retrieves the unique segment indices from a given segmentation.
 *
 * @param segmentationId - The ID of the segmentation.
 * @returns An array of unique segment indices.
 * @throws If no geometryIds are found for the segmentationId.
 */
function getUniqueSegmentIndices(segmentationId) {
  // Attempt to fetch from cache first
  const cachedResult = getCachedSegmentIndices(segmentationId);
  if (cachedResult) {
    return cachedResult;
  }

  const segmentation = getSegmentation(segmentationId);
  if (!segmentation) {
    throw new Error(
      `No segmentation found for segmentationId ${segmentationId}`
    );
  }

  let indices;
  if (segmentation.representationData.Labelmap) {
    indices = handleLabelmapSegmentation(segmentation);
  } else if (segmentation.representationData.Contour) {
    indices = handleContourSegmentation(segmentation);
  } else if (segmentation.representationData.Surface) {
    indices = handleSurfaceSegmentation(segmentation);
  } else {
    throw new Error(
      `Unsupported segmentation type: ${segmentation.representationData}`
    );
  }

  // Update cache
  setCachedSegmentIndices(segmentationId, indices);

  return indices;
}

function handleLabelmapSegmentation(segmentation) {
  return Object.keys(segmentation.segments)
    .map(Number)
    .sort((a, b) => a - b);
}

function handleContourSegmentation(segmentation) {
  const { annotationUIDsMap, geometryIds } =
    segmentation.representationData.Contour || {};
  if (!geometryIds) {
    throw new Error(
      `No geometryIds found for segmentationId ${segmentation.segmentationId}`
    );
  }

  const indices = new Set([...annotationUIDsMap.keys()]);
  geometryIds.forEach((geometryId) => {
    const geometry = cache.getGeometry(geometryId);
    indices.add((geometry.data as Types.IContourSet).segmentIndex);
  });

  return Array.from(indices).sort((a, b) => a - b);
}

function handleSurfaceSegmentation(segmentation) {
  const geometryIds =
    segmentation.representationData.Surface?.geometryIds ?? [];
  return Array.from(geometryIds.keys())
    .map(Number)
    .sort((a, b) => a - b);
}

export { getUniqueSegmentIndices };
