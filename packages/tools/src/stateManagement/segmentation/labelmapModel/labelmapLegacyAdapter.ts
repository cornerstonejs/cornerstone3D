import type { Segmentation } from '../../../types/SegmentationStateTypes';
import {
  ensureLabelmapState,
  getSegmentOrder,
} from './normalizeLabelmapSegmentationData';
import { getLabelmaps } from './labelmapLayerStore';

function syncLegacyLabelmapData(segmentation: Segmentation): void {
  const labelmapState = ensureLabelmapState(segmentation);
  if (!labelmapState) {
    return;
  }

  const firstSegmentIndex = getSegmentOrder(segmentation)[0] ?? 1;
  const primaryLabelmapId =
    labelmapState.segmentBindings[firstSegmentIndex]?.labelmapId ??
    Object.keys(labelmapState.labelmaps)[0];
  const primaryLayer = labelmapState.labelmaps[primaryLabelmapId];

  if (!primaryLayer) {
    return;
  }

  labelmapState.volumeId = primaryLayer.volumeId;
  labelmapState.referencedVolumeId = primaryLayer.referencedVolumeId;
  labelmapState.imageIds = primaryLayer.imageIds;
  labelmapState.referencedImageIds = primaryLayer.referencedImageIds;
}

function getReferencedImageIdToCurrentImageIdMap(
  segmentation: Segmentation
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  getLabelmaps(segmentation).forEach((layer) => {
    const referencedImageIds = layer.referencedImageIds ?? layer.imageIds ?? [];
    const imageIds = layer.imageIds ?? [];

    referencedImageIds.forEach((referenceImageId, index) => {
      if (!imageIds[index]) {
        return;
      }

      const values = map.get(referenceImageId) ?? [];
      if (!values.includes(imageIds[index])) {
        values.push(imageIds[index]);
      }
      map.set(referenceImageId, values);
    });
  });

  return map;
}

export { getReferencedImageIdToCurrentImageIdMap, syncLegacyLabelmapData };
