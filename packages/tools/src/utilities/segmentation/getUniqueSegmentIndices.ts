import { Types, cache } from '@cornerstonejs/core';
import { getSegmentation } from '../../stateManagement/segmentation/segmentationState';
import { isVolumeSegmentation } from '../../tools/segmentation/strategies/utils/stackVolumeCheck';
import { SegmentationRepresentations } from '../../enums';

const segmentIndicesCache = new Map<
  string,
  { indices: number[]; isDirty: boolean }
>();

/**
 * Sets the segmentation as dirty, indicating that it needs to be updated.
 * @param segmentationId - The ID of the segmentation.
 */
export const setSegmentationDirty = (segmentationId: string) => {
  const cached = segmentIndicesCache.get(segmentationId);
  if (cached) {
    cached.isDirty = true;
  }
};

export const setSegmentationClean = (segmentationId: string) => {
  const cached = segmentIndicesCache.get(segmentationId);
  if (cached) {
    cached.isDirty = false;
  }
};

function getCachedSegmentIndices(segmentationId) {
  const cached = segmentIndicesCache.get(segmentationId);
  if (cached && !cached.isDirty) {
    return cached.indices;
  }
  return null;
}

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
  switch (segmentation.type) {
    case SegmentationRepresentations.Labelmap:
      indices = handleLabelmapSegmentation(segmentation, segmentationId);
      break;
    case SegmentationRepresentations.Contour:
      indices = handleContourSegmentation(segmentation);
      break;
    case SegmentationRepresentations.Surface:
      indices = handleSurfaceSegmentation(segmentation);
      break;
    default:
      throw new Error(`Unsupported segmentation type: ${segmentation.type}`);
  }

  // Update cache
  segmentIndicesCache.set(segmentationId, { indices, isDirty: false });
  return indices;
}

function handleLabelmapSegmentation(segmentation, segmentationId) {
  const labelmapData =
    segmentation.representationData[SegmentationRepresentations.Labelmap];
  const keySet = new Set();

  if (isVolumeSegmentation(labelmapData)) {
    addVolumeSegmentIndices(keySet, segmentationId);
  } else {
    addImageSegmentIndices(keySet, labelmapData.imageIdReferenceMap);
  }

  return Array.from(keySet)
    .map(Number)
    .sort((a, b) => a - b);
}

function addVolumeSegmentIndices(keySet, segmentationId) {
  const volume = cache.getVolume(segmentationId);
  const scalarData = volume.getScalarData();
  scalarData.forEach((segmentIndex) => {
    if (segmentIndex !== 0) {
      keySet.add(segmentIndex);
    }
  });
}

function addImageSegmentIndices(keySet, imageIdReferenceMap) {
  imageIdReferenceMap.forEach((segmentationImageId) => {
    const image = cache.getImage(segmentationImageId);
    const scalarData = image.getPixelData();
    scalarData.forEach((segmentIndex) => {
      if (segmentIndex !== 0) {
        keySet.add(segmentIndex);
      }
    });
  });
}

function handleContourSegmentation(segmentation) {
  const { annotationUIDsMap, geometryIds } =
    segmentation.representationData.CONTOUR || {};
  if (!geometryIds) {
    throw new Error(
      `No geometryIds found for segmentationId ${segmentation.segmentationId}`
    );
  }

  const indices = new Set([...annotationUIDsMap.keys()]);
  geometryIds.forEach((geometryId) => {
    const geometry = cache.getGeometry(geometryId);
    indices.add((geometry.data as Types.IContourSet).getSegmentIndex());
  });

  return Array.from(indices).sort((a, b) => a - b);
}

function handleSurfaceSegmentation(segmentation) {
  const geometryIds =
    segmentation.representationData.SURFACE?.geometryIds ?? [];
  return Array.from(geometryIds.keys())
    .map(Number)
    .sort((a, b) => a - b);
}

export { getUniqueSegmentIndices };
