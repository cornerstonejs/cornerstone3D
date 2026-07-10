import type { InitializedOperationData } from '../BrushStrategy';
import type { LabelmapLayer } from '../../../../types/LabelmapTypes';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import { handleUseSegmentCenterIndex } from '../utils/handleUseSegmentCenterIndex';
import { getSegmentation } from '../../../../stateManagement/segmentation/getSegmentation';
import { getLabelmap } from '../../../../stateManagement/segmentation/labelmapModel';

/**
 * setValue runs once per voxel of a stroke, so the segmentation/labelmap
 * lookup must not be resolved per call (resolving it re-normalizes the whole
 * labelmap binding state — the dominant cost of large sphere strokes). The
 * operation data object is created fresh for every stroke, which makes it a
 * natural cache key: bindings cannot change mid-stroke.
 */
const strokeLayerCache = new WeakMap<
  InitializedOperationData,
  { hasSegmentationAndLabelmap: boolean; layer: LabelmapLayer | undefined }
>();

function resolveExistingSegmentIndex(
  operationData: InitializedOperationData,
  existingValue: number
): number | undefined {
  let cached = strokeLayerCache.get(operationData);

  if (!cached) {
    const { segmentationId, labelmapId } = operationData;
    const segmentation = getSegmentation(segmentationId);
    const layer =
      segmentation && labelmapId
        ? getLabelmap(segmentation, labelmapId)
        : undefined;

    cached = {
      hasSegmentationAndLabelmap: !!(segmentation && labelmapId),
      layer,
    };
    strokeLayerCache.set(operationData, cached);
  }

  // Mirrors getSegmentIndexForLabelValue semantics: without a segmentation
  // and labelmap the raw value IS the segment index; with them, a missing
  // layer (or null value) resolves to undefined, otherwise map through the
  // layer's labelValue table with the raw value as fallback.
  if (!cached.hasSegmentationAndLabelmap) {
    return existingValue;
  }

  if (!cached.layer || existingValue == null) {
    return undefined;
  }

  return cached.layer.labelToSegmentIndex?.[existingValue] ?? existingValue;
}

/**
 * Creates a set value function which will apply the specified segmentIndex
 * to the given location.
 * If segmentIndex is null, it will clear the given segment index instead
 * This is all done through the voxelManager so that values can be recorded
 * as changed, and the original values remembered.
 */
export default {
  [StrategyCallbacks.INTERNAL_setValue]: (
    operationData: InitializedOperationData,
    { value, index }
  ) => {
    const {
      segmentsLocked,
      previewSegmentIndex,
      memo,
      segmentationVoxelManager,
      centerSegmentIndexInfo,
      segmentIndex,
      labelValue,
    } = operationData;

    const existingValue = segmentationVoxelManager.getAtIndex(index);
    const existingSegmentIndex = resolveExistingSegmentIndex(
      operationData,
      existingValue as number
    );
    const writeValue = previewSegmentIndex ?? labelValue ?? segmentIndex;

    if (segmentsLocked.includes(existingSegmentIndex)) {
      return;
    }

    if (
      !centerSegmentIndexInfo &&
      existingValue === (labelValue ?? segmentIndex)
    ) {
      return;
    }

    if (
      centerSegmentIndexInfo?.segmentIndex !== 0 &&
      existingValue === (labelValue ?? segmentIndex)
    ) {
      return;
    }

    // this means we have previewSegmentIndex
    if (centerSegmentIndexInfo?.segmentIndex === null) {
      memo.voxelManager.setAtIndex(index, writeValue);
      return;
    }

    if (!previewSegmentIndex) {
      let useSegmentIndex = labelValue ?? segmentIndex;
      if (centerSegmentIndexInfo) {
        useSegmentIndex = centerSegmentIndexInfo.segmentIndex;
      }

      memo.voxelManager.setAtIndex(index, useSegmentIndex);
      return;
    }

    // we have centerSegmentIndexInfo with preview enabled
    handleUseSegmentCenterIndex({
      operationData,
      existingValue,
      index,
    });
  },
};
