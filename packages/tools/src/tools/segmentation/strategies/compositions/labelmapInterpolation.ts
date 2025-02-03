import { utilities, peerImport } from '@cornerstonejs/core';
import type { InitializedOperationData } from '../BrushStrategy';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import getItkImage from '../utils/getItkImage';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import PreviewMethods from './preview';

type MorphologicalContourInterpolationOptions = {
  label?: number;
  axis?: number;
  noHeuristicAlignment?: boolean;
  noUseDistanceTransform?: boolean;
  useCustomSlicePositions?: boolean;
};

/**
 * Adds an isWithinThreshold to the operation data that checks that the
 * image value is within threshold[0]...threshold[1]
 * No-op if threshold not defined.
 */
export default {
  [StrategyCallbacks.Interpolate]: async (
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
    const inputImage = await getItkImage(
      segmentationImageData,
      'interpolation'
    );

    let itkModule;
    try {
      // Use peerImport instead of dynamic import
      itkModule = await peerImport(
        '@itk-wasm/morphological-contour-interpolation'
      );
      if (!itkModule) {
        throw new Error('Module not found');
      }
    } catch (error) {
      console.debug(
        "Warning: '@itk-wasm/morphological-contour-interpolation' module not found. Please install it separately."
      );
      return operationData;
    }

    const outputPromise = itkModule.morphologicalContourInterpolation(
      inputImage,
      {
        ...configuration,
        label: segmentIndex,
        webWorker: false,
      }
    );
    outputPromise.then((value) => {
      const { outputImage } = value;

      const previewColors = operationData.configuration?.preview?.previewColors;
      const assignIndex =
        previewSegmentIndex ?? (previewColors ? 255 : segmentIndex);
      // Reset the colors - needs operation data set to do this
      operationData.previewColors ||= previewColors;
      operationData.previewSegmentIndex ||= previewColors ? 255 : undefined;
      PreviewMethods[StrategyCallbacks.Initialize](operationData);

      segmentationVoxelManager.forEach(({ value: originalValue, index }) => {
        const newValue = outputImage.data[index];
        if (newValue === originalValue) {
          return;
        }
        previewVoxelManager.setAtIndex(index, assignIndex);
      });

      triggerSegmentationDataModified(
        operationData.segmentationId,
        previewVoxelManager.getArrayOfModifiedSlices(),
        assignIndex
      );
    });
    return operationData;
  },
};
