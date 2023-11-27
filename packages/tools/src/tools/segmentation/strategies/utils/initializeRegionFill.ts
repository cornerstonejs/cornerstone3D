import type { InitializedOperationData } from '../BrushStrategy';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import pointInShapeCallback from '../../../../utilities/pointInShapeCallback';

export default function (operationData: InitializedOperationData) {
  operationData.fill = () => {
    console.log('Calling fill');
    const callback = operationData.isWithinThreshold
      ? (data) => {
          const { value, index } = data;
          if (operationData.segmentsLocked.includes(value)) {
            return;
          }
          if (!operationData.isWithinThreshold(index)) {
            return;
          }
          operationData.setValue(data);
        }
      : operationData.setValue;

    pointInShapeCallback(
      operationData.imageData,
      operationData.isInObject,
      callback,
      operationData.boundsIJK
    );
    operationData.strategySpecificConfiguration.TRACKING?.updateCenter(
      operationData.centerIJK,
      operationData.boundsIJK
    );

    const arrayOfSlices: number[] = Array.from(
      operationData.modifiedSlicesToUse
    );

    triggerSegmentationDataModified(
      operationData.segmentationId,
      arrayOfSlices
    );
  };
}
