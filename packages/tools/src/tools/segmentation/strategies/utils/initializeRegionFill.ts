import type {
  InitializedOperationData,
  InitializerInstance,
} from '../BrushStrategy';
import pointInShapeCallback from '../../../../utilities/pointInShapeCallback';

export default {
  fill: (enabled, operationData: InitializedOperationData) => {
    const {
      segmentsLocked,
      segmentationImageData,
      segmentationVoxelValue,
      previewVoxelValue,
      imageVoxelValue,
      brushStrategy,
      centerIJK,
    } = operationData;
    const isWithinThreshold = brushStrategy.createIsInThreshold?.(
      enabled,
      operationData
    );
    const { setValue } = brushStrategy;

    const callback = isWithinThreshold
      ? (data) => {
          const { value, index } = data;
          if (segmentsLocked.includes(value)) {
            return;
          }
          if (!isWithinThreshold(index)) {
            return;
          }
          setValue(data, operationData);
        }
      : (data) => setValue(data, operationData);

    pointInShapeCallback(
      segmentationImageData as unknown,
      imageVoxelValue.isInObject,
      callback,
      segmentationVoxelValue.boundsIJK
    );

    previewVoxelValue.addPoint(centerIJK);
  },
} as InitializerInstance;
