import type {
  InitializedOperationData,
  InitializerInstance,
} from '../BrushStrategy';
import pointInShapeCallback from '../../../../utilities/pointInShapeCallback';

/**
 * This setup function will dynamically determine the segment index to use based on:
 * 1. Surrounding region in active viewport not having any default segment index
 *    being applied.  When that happens, use the default segment index (no-op)
 * 2. Segment index of clicked on point - extends this segment index (which
 *    erases if the segment index clicked is `0`)
 *
 * The impact on user behaviour is that when there isn't an active drag preview,
 * the user can click nearby but outside the segment to remove it, and can click
 * inside the segment to extend it.
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
      imageVoxelValue,
      segmentationImageData,
    } = operationData;
    if (!strategySpecificConfiguration.useCenterSegmentIndex || preview) {
      return;
    }
    let hasSegmentIndex = false;
    let hasPreviewIndex = false;
    const callback = ({ value }) => {
      hasSegmentIndex ||= value === segmentIndex;
      hasPreviewIndex ||= value === previewSegmentIndex;
    };

    pointInShapeCallback(
      segmentationImageData as unknown,
      imageVoxelValue.isInObject,
      callback,
      segmentationVoxelValue.boundsIJK
    );

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
