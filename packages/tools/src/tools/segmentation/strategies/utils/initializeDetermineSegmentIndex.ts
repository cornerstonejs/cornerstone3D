import type {
  InitializedOperationData,
  InitializerInstance,
} from '../BrushStrategy';

/**
 * This setup function will dynamically determine the segment index to use based on:
 * 1. Surrounding region in active viewport not having any default segment index
 *    being applied.  When that happens, use the default segment index (no-op)
 * 2. Segment index of clicked on point - extends this segment index (which
 *    erases if the segment index clicked is `0`)
 */
export default {
  createInitialized: (enabled, operationData: InitializedOperationData) => {
    const {
      segmentIndex,
      previewSegmentIndex,
      segmentationVoxelValue,
      centerIJK,
      strategySpecificConfiguration,
      preview,
    } = operationData;
    if (!strategySpecificConfiguration.useCenterSegmentIndex || preview) {
      return;
    }
    let hasSegmentIndex = false;
    let hasPreviewIndex = false;
    segmentationVoxelValue.forEach(({ index, value }) => {
      hasSegmentIndex ||= value === segmentIndex;
      hasPreviewIndex ||= value === previewSegmentIndex;
    });
    if (!hasSegmentIndex && !hasPreviewIndex) {
      return;
    }

    const existingValue = segmentationVoxelValue.get(centerIJK);
    if (existingValue === previewSegmentIndex) {
      return;
    }
    operationData.segmentIndex = existingValue;
  },
} as InitializerInstance;
