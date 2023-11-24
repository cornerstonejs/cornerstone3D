import type { InitializedOperationData } from '../BrushStrategy';
import { segmentIndex as segmentIndexController } from '../../../../stateManagement/segmentation';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import pointInShapeCallback from '../../../../utilities/pointInShapeCallback';
import type BoundsIJK from '../../../types/BoundsIJK';

/**
 * Sets up a preview to use an alternate set of colours.  First fills the
 * preview segment index with the final one for all pixels, then resets
 * the preview colours.
 */
export default function initializeIslandRemoval(
  operationData: InitializedOperationData
) {
  if (!operationData.strategySpecificConfiguration.THRESHOLD?.threshold) {
    return;
  }
  const { completeUp } = operationData;
  operationData.completeUp = () => {
    completeUp?.();

    console.log('completeUp');
    // TODO - add island removal here based on the full path seen
    // const arrayOfSlices: number[] = Array.from(
    //   operationData.modifiedSlicesToUse
    // );
    // operationData.modifiedSlicesToUse.clear();

    // triggerSegmentationDataModified(
    //   operationData.segmentationId,
    //   arrayOfSlices
    // );
  };

  // initializerData.cancel = () => {
  //   console.log('Restore original data', previewSegmentationIndex);
  // };
}
