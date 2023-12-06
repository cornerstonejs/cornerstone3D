import type {
  InitializedOperationData,
  InitializerInstance,
} from '../BrushStrategy';
import pointInShapeCallback from '../../../../utilities/pointInShapeCallback';

/**
 * Creates a fill strategy that uses the isWithinThreshold created by the
 * createIsInThreshold and the bounds specified in the boundsIJK to go over
 * the specified area, checking if in threshold, and if so, filling that area
 * with the new segment by calling the setValue function.
 */
export default {
  fill: (enabledElement, operationData: InitializedOperationData) => {
    const {
      segmentsLocked,
      segmentationImageData,
      segmentationVoxelManager: segmentationVoxelManager,
      previewVoxelManager: previewVoxelManager,
      imageVoxelManager: imageVoxelManager,
      brushStrategy,
      centerIJK,
    } = operationData;
    const isWithinThreshold = brushStrategy.createIsInThreshold?.(
      enabledElement,
      operationData
    );
    const { setValue } = brushStrategy;

    const callback = isWithinThreshold
      ? (data) => {
          const { value, index } = data;
          if (segmentsLocked.includes(value) || !isWithinThreshold(index)) {
            return;
          }
          setValue(data, operationData);
        }
      : (data) => setValue(data, operationData);

    pointInShapeCallback(
      segmentationImageData as unknown,
      imageVoxelManager.isInObject,
      callback,
      segmentationVoxelManager.boundsIJK
    );

    previewVoxelManager.addPoint(centerIJK);
  },
} as InitializerInstance;
