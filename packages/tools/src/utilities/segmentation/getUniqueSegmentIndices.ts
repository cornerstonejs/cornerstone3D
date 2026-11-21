import type { Types } from '@cornerstonejs/core';
import { cache, utilities } from '@cornerstonejs/core';
import { SegmentationRepresentations } from '../../enums';
import { getCachedSegmentIndices, setCachedSegmentIndices } from './utilities';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import {
  getLabelmaps,
  getOrCreateDynamicLabelmapVolume,
} from '../../stateManagement/segmentation/labelmapModel/labelmapLayerStore';
import { isDynamicLabelmapVolume } from '../../stateManagement/segmentation/labelmapModel/dynamicLabelmapVolume';
import type { Segmentation } from '../../types/SegmentationStateTypes';
import type { LabelmapLayer } from '../../types/LabelmapTypes';

/**
 * Retrieves the unique segment indices from a given segmentation.
 *
 * For a labelmap these are the segments that have at least one voxel: the
 * label values of the voxels of every labelmap layer, each mapped to its
 * segment. A 4D labelmap gives the segments of the time point on display.
 * Each call reads the voxels, so an edit costs nothing more and the answer
 * holds also after a write that fired no SEGMENTATION_DATA_MODIFIED. The
 * answer for contours and surfaces is kept until the next
 * SEGMENTATION_DATA_MODIFIED of the segmentation.
 *
 * @param segmentationId - The ID of the segmentation.
 * @returns An array of unique segment indices.
 * @throws If no geometryIds are found for the segmentationId.
 */
function getUniqueSegmentIndices(segmentationId) {
  const segmentation = getSegmentation(segmentationId);
  if (segmentation?.representationData.Labelmap) {
    return handleLabelmapSegmentation(segmentation);
  }

  // Attempt to fetch from cache first
  const cachedResult = getCachedSegmentIndices(segmentationId);
  if (cachedResult) {
    return cachedResult;
  }

  if (!segmentation) {
    throw new Error(
      `No segmentation found for segmentationId ${segmentationId}`
    );
  }

  let indices;
  if (segmentation.representationData.Contour) {
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

/**
 * The segments of a labelmap segmentation that have at least one voxel.
 */
function handleLabelmapSegmentation(segmentation: Segmentation): number[] {
  getOrCreateDynamicLabelmapVolume(segmentation);

  const segmentIndices = new Set<number>();

  getLabelmaps(segmentation).forEach((layer) => {
    const labelValues = new Set<number>();
    getLayerVoxelManagers(layer).forEach((voxelManager) =>
      addLabelValues(voxelManager, labelValues)
    );
    labelValues.forEach((labelValue) =>
      segmentIndices.add(layer.labelToSegmentIndex?.[labelValue] ?? labelValue)
    );
  });

  if (!segmentation.segments?.[PREVIEW_SEGMENT_INDEX]) {
    segmentIndices.delete(PREVIEW_SEGMENT_INDEX);
  }

  return Array.from(segmentIndices).sort((a, b) => a - b);
}

/**
 * The value that a labelmap tool writes for its preview (the preview colour of
 * the colour LUT). Its voxels are not a segment unless the segmentation has a
 * segment of that index.
 */
const PREVIEW_SEGMENT_INDEX = 255;

/**
 * The voxel managers that hold the voxels of one labelmap layer: those of its
 * volume, or of the time point on display of a 4D labelmap, or else those of
 * its images.
 */
function getLayerVoxelManagers(
  layer: LabelmapLayer
): Types.IVoxelManager<number>[] {
  const volumeId = layer.volumeId ?? layer.geometryVolumeId;
  const volume = volumeId
    ? (cache.getVolume(volumeId) as Types.IImageVolume)
    : undefined;

  if (volume && (layer.volumeId || isDynamicLabelmapVolume(volume))) {
    return getVolumeVoxelManagers(volume);
  }

  return getImageVoxelManagers(layer.imageIds);
}

/**
 * The voxel managers of a volume: its own when it holds an array, else those
 * of its images when every slice has one in the cache, else its own.
 */
function getVolumeVoxelManagers(
  volume: Types.IImageVolume
): Types.IVoxelManager<number>[] {
  const voxelManager = volume.voxelManager as Types.IVoxelManager<number>;

  if (voxelManager.getWritableScalarData?.()) {
    return [voxelManager];
  }

  const { imageIds, dimensions } = volume;
  if (imageIds?.length === dimensions[2]) {
    const imageVoxelManagers = getImageVoxelManagers(imageIds);
    if (imageVoxelManagers.length === imageIds.length) {
      return imageVoxelManagers;
    }
  }

  return [voxelManager];
}

function getImageVoxelManagers(
  imageIds: string[] = []
): Types.IVoxelManager<number>[] {
  return imageIds
    .map(
      (imageId) =>
        cache.getImage(imageId)?.voxelManager as Types.IVoxelManager<number>
    )
    .filter(Boolean);
}

/**
 * Adds the non-zero values of a voxel manager: from the runs of an RLE map
 * whose voxels outside the runs are 0, from the array that it holds, or one
 * voxel at a time.
 */
function addLabelValues(
  voxelManager: Types.IVoxelManager<number>,
  labelValues: Set<number>
): void {
  const { map } = voxelManager;

  if (map instanceof utilities.RLEVoxelMap && !map.defaultValue) {
    map.forEach((_baseIndex, { value }) => {
      if (value) {
        labelValues.add(value);
      }
    });
    return;
  }

  const scalarData = voxelManager.getWritableScalarData?.();
  if (scalarData) {
    addArrayLabelValues(scalarData, labelValues);
    return;
  }

  voxelManager.forEach(({ value }) => {
    if (value) {
      labelValues.add(Number(value));
    }
  });
}

/**
 * Adds the non-zero values of an array. For values of one or two bytes it
 * reads four bytes at a time and skips the zero words, since most voxels of a
 * labelmap are zero.
 */
function addArrayLabelValues(
  scalarData: Types.PixelDataTypedArray,
  labelValues: Set<number>
): void {
  const { BYTES_PER_ELEMENT, byteOffset, length } = scalarData;
  const valuesPerWord = 4 / BYTES_PER_ELEMENT;
  const wordCount =
    BYTES_PER_ELEMENT <= 2 && byteOffset % 4 === 0
      ? Math.floor(length / valuesPerWord)
      : 0;
  const words = wordCount
    ? new Uint32Array(scalarData.buffer, byteOffset, wordCount)
    : undefined;
  let lastValue = 0;

  for (let word = 0; word < wordCount; word++) {
    if (words[word] === 0) {
      continue;
    }
    const end = (word + 1) * valuesPerWord;
    for (let index = word * valuesPerWord; index < end; index++) {
      const value = scalarData[index];
      if (value && value !== lastValue) {
        labelValues.add(value);
        lastValue = value;
      }
    }
  }

  for (let index = wordCount * valuesPerWord; index < length; index++) {
    const value = scalarData[index];
    if (value && value !== lastValue) {
      labelValues.add(value);
      lastValue = value;
    }
  }
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
