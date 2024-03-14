import {
  MorphologicalContourInterpolationOptions,
  morphologicalContourInterpolation,
} from '@itk-wasm/morphological-contour-interpolation';
import { utilities } from '@cornerstonejs/core';
import type { InitializedOperationData } from '../BrushStrategy';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import getItkImage from '../utils/getItkImage';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import PreviewMethods from './preview';

const { VoxelManager } = utilities;

/**
 * Adds an isWithinThreshold to the operation data that checks that the
 * image value is within threshold[0]...threshold[1]
 * No-op if threshold not defined.
 */
export default {
  [StrategyCallbacks.Interpolate]: (
    operationData: InitializedOperationData,
    configuration: MorphologicalContourInterpolationOptions
  ) => {
    const {
      segmentationImageData,
      segmentIndex,
      preview,
      segmentationVoxelManager,
      previewSegmentIndex,
      previewVoxelManager,
    } = operationData;

    if (preview) {
      // Mark everything as segment index value so the interpolation works
      const callback = ({ index }) => {
        segmentationVoxelManager.setAtIndex(index, segmentIndex);
      };
      previewVoxelManager.forEach(callback);
    }
    const inputImage = getItkImage(segmentationImageData, 'interpolation');
    const outputPromise = morphologicalContourInterpolation(inputImage, {
      ...configuration,
      label: segmentIndex,
      webWorker: false,
    });
    outputPromise.then((value) => {
      const { outputImage } = value;
      const updateVoxelManager = VoxelManager.createVolumeVoxelManager(
        segmentationVoxelManager.dimensions,
        outputImage.data
      );
      const previewColors = operationData.configuration?.preview?.previewColors;
      const assignIndex =
        previewSegmentIndex ?? (previewColors ? 255 : segmentIndex);
      // Reset the colors - needs operation data set to do this
      operationData.previewColors ||= previewColors;
      operationData.previewSegmentIndex ||= previewColors ? 255 : undefined;
      PreviewMethods[StrategyCallbacks.Initialize](operationData);

      updateVoxelManager.forEach(({ value, index }) => {
        const origValue = segmentationVoxelManager.getAtIndex(index);
        if (origValue === value) {
          return;
        }
        previewVoxelManager.setAtIndex(index, assignIndex);
      });

      triggerSegmentationDataModified(
        operationData.segmentationId,
        previewVoxelManager.getArrayOfSlices(),
        assignIndex
      );
    });
    return operationData;
  },
};
