import { Types, cache } from '@cornerstonejs/core';
import { SegmentationRepresentations } from '../../enums';
import { getSegmentation } from '../../stateManagement/segmentation/segmentationState';
import { isVolumeSegmentation } from '../../tools/segmentation/strategies/utils/stackVolumeCheck';

/**
 * Retrieves the unique segment indices from a given segmentation.
 *
 * @param segmentationId - The ID of the segmentation.
 * @returns An array of unique segment indices.
 * @throws If no geometryIds are found for the segmentationId.
 */
function getUniqueSegmentIndices(segmentationId) {
  const segmentation = getSegmentation(segmentationId);

  if (segmentation.type === SegmentationRepresentations.Labelmap) {
    const labelmapData =
      segmentation.representationData[SegmentationRepresentations.Labelmap];

    const keySet = {};

    if (isVolumeSegmentation(labelmapData)) {
      const volume = cache.getVolume(segmentationId);
      const scalarData = volume.getScalarData();

      for (let i = 0; i < scalarData.length; i++) {
        const segmentIndex = scalarData[i];
        if (segmentIndex !== 0 && !keySet[segmentIndex]) {
          keySet[segmentIndex] = true;
        }
      }
    } else {
      labelmapData.imageIdReferenceMap.forEach((segmentationImageId) => {
        const image = cache.getImage(segmentationImageId);
        const scalarData = image.getPixelData();

        for (let i = 0; i < scalarData.length; i++) {
          const segmentIndex = scalarData[i];
          if (segmentIndex !== 0 && !keySet[segmentIndex]) {
            keySet[segmentIndex] = true;
          }
        }
      });
    }

    return Object.keys(keySet).map((it) => parseInt(it, 10));
  } else if (segmentation.type === SegmentationRepresentations.Contour) {
    const annotationUIDsMap =
      segmentation.representationData.CONTOUR?.annotationUIDsMap;

    const indices = new Set(annotationUIDsMap.keys());
    const geometryIds = segmentation.representationData.CONTOUR?.geometryIds;

    if (!geometryIds) {
      throw new Error(
        `No geometryIds found for segmentationId ${segmentationId}`
      );
    }

    geometryIds.forEach((geometryId) => {
      const geometry = cache.getGeometry(geometryId) as Types.IGeometry;
      indices.add((geometry.data as Types.IContourSet).getSegmentIndex());
    });

    return Array.from(indices.values()).sort();
  }
}

export { getUniqueSegmentIndices };
