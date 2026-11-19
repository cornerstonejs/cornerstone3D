import type { Segmentation } from '../../../types/SegmentationStateTypes';
import {
  ensureLabelmapState,
  getSegmentOrder,
} from './normalizeLabelmapSegmentationData';
import { getLabelmaps } from './labelmapLayerStore';
import { forEachLabelmapImageReference } from './labelmapImageIdMapping';

function syncOptionalLegacyProperty<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K]
): void {
  if (value == null) {
    delete target[key];
    return;
  }

  target[key] = value;
}

/**
 * Keeps the top-level `volumeId`, `referencedVolumeId`, `imageIds` and
 * `referencedImageIds` of the Labelmap data of a segmentation equal to those
 * of its primary labelmap layer. Applications read these public fields of
 * `LabelmapSegmentationData`. A field that the layer does not have is deleted.
 */
function syncLegacyLabelmapData(segmentation: Segmentation): void {
  const labelmapState = ensureLabelmapState(segmentation);
  if (!labelmapState) {
    return;
  }

  const firstSegmentIndex = getSegmentOrder(segmentation)[0] ?? 1;
  const primaryLabelmapId =
    labelmapState.primaryLabelmapId ??
    labelmapState.segmentBindings[firstSegmentIndex]?.labelmapId ??
    Object.keys(labelmapState.labelmaps)[0];
  const primaryLayer = labelmapState.labelmaps[primaryLabelmapId];

  if (!primaryLayer) {
    return;
  }

  syncOptionalLegacyProperty(labelmapState, 'volumeId', primaryLayer.volumeId);
  syncOptionalLegacyProperty(
    labelmapState,
    'referencedVolumeId',
    primaryLayer.referencedVolumeId
  );
  syncOptionalLegacyProperty(labelmapState, 'imageIds', primaryLayer.imageIds);
  syncOptionalLegacyProperty(
    labelmapState,
    'referencedImageIds',
    primaryLayer.referencedImageIds
  );
}

function getReferencedImageIdToCurrentImageIdMap(
  segmentation: Segmentation
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  getLabelmaps(segmentation).forEach((layer) => {
    forEachLabelmapImageReference(
      layer,
      (referenceImageId, labelmapImageId) => {
        const values = map.get(referenceImageId) ?? [];
        if (!values.includes(labelmapImageId)) {
          values.push(labelmapImageId);
        }
        map.set(referenceImageId, values);
      }
    );
  });

  return map;
}

export { getReferencedImageIdToCurrentImageIdMap, syncLegacyLabelmapData };
