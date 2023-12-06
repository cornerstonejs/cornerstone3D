import type {
  InitializedOperationData,
  InitializerInstance,
} from '../BrushStrategy';
import pointInShapeCallback from '../../../../utilities/pointInShapeCallback';

/**
 * This function determines whether to fill or erase based on what the user
 * initially clicks on.  The behaviour is:
 * 1. If the user clicks on an area that has no active segment index in it,
 *    then assume the user using the active segment index for filling
 * 2. Find the segment index of the pixel the user clicked on, and assume they
 *    want to fill with that segment index.  Use the given segment index for
 *    the fill colour.
 *    a. If the user clicks on the active segment index, then they will fill
 *       with the active segment
 *    b. If the user clicks on the 0 segment index, they will clear the segment
 *       index, erasing the segment.
 *    c. If the user clicks on another segment index, they will "restore" that
 *       segment index, so that they can push back the segment area.
 *
 */
export default {
  createInitialized: (
    enabledElement,
    operationData: InitializedOperationData
  ) => {
    const { strategySpecificConfiguration } = operationData;
    const { centerSegmentIndex } = strategySpecificConfiguration;
    if (centerSegmentIndex) {
      operationData.segmentIndex = centerSegmentIndex.segmentIndex;
    }
  },

  initDown: (enabledElement, operationData: InitializedOperationData) => {
    const {
      segmentIndex,
      previewSegmentIndex,
      segmentationVoxelValue,
      centerIJK,
      strategySpecificConfiguration,
      imageVoxelValue,
      segmentationImageData,
    } = operationData;
    if (!strategySpecificConfiguration?.useCenterSegmentIndex) {
      return;
    }
    // Get rid of the previous data
    delete strategySpecificConfiguration.centerSegmentIndex;

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
      console.log('Neither segment index nor preview index', segmentIndex);
      return;
    }

    let existingValue = segmentationVoxelValue.get(centerIJK);
    if (existingValue === previewSegmentIndex) {
      console.log('Over preview index', segmentIndex);
      return;
    }
    if (hasPreviewIndex && existingValue !== segmentIndex) {
      // Clear the preview area
      console.log('Region has preview index', existingValue, segmentIndex);
      existingValue = null;
    } else {
      console.log(
        'Region does not have preview index, using',
        existingValue,
        segmentIndex
      );
    }
    operationData.segmentIndex = existingValue;
    strategySpecificConfiguration.centerSegmentIndex = {
      segmentIndex: existingValue,
    };
  },
} as InitializerInstance;
