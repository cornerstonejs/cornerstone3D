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
      previewVoxelValue,
      preview,
    } = operationData;
    if (!strategySpecificConfiguration.useCenterSegmentIndex || preview) {
      return;
    }
    let hasSegmentIndex = false;
    segmentationVoxelValue.forEach(({ index, value }) => {
      hasSegmentIndex ||=
        segmentIndex === value || previewSegmentIndex === value;
    });
    if (!hasSegmentIndex) {
      return;
    }

    let existingValue = segmentationVoxelValue.get(centerIJK);
    if (existingValue === previewSegmentIndex) {
      existingValue = previewVoxelValue.get(centerIJK) === 0 ? segmentIndex : 0;
    }
    operationData.segmentIndex = existingValue;
  },
} as InitializerInstance;
