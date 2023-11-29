import type { InitializedOperationData } from '../BrushStrategy';
import pointInShapeCallback from '../../../../utilities/pointInShapeCallback';

export default function (operationData: InitializedOperationData) {
  operationData.fill = () => {
    const {
      segmentsLocked,
      segmentationImageData,
      setValue,
      isWithinThreshold,
      segmentationVoxelValue,
    } = operationData;
    const callback = isWithinThreshold
      ? (data) => {
          const { value, index } = data;
          if (segmentsLocked.includes(value)) {
            return;
          }
          if (!isWithinThreshold(index)) {
            return;
          }
          setValue(data);
        }
      : operationData.setValue;

    console.log('About to fill', segmentationVoxelValue.boundsIJK);
    pointInShapeCallback(
      segmentationImageData as unknown,
      operationData.isInObject,
      callback,
      segmentationVoxelValue.boundsIJK
    );
    operationData.previewVoxelValue.addPoint(operationData.centerIJK);
  };
}
