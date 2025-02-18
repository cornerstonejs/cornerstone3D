import { peerImport } from '@cornerstonejs/core';
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
 * @deprecated
 * Use the interpolateLabelmap utility function to interpolate the labelmap
 * instead of this strategy.
 */
export default {
  [StrategyCallbacks.Interpolate]: async (
    operationData: InitializedOperationData,
    configuration: MorphologicalContourInterpolationOptions
  ) => {
    console.warn(
      'Warning: The labelmap interpolation strategy is deprecated. Use the interpolateLabelmap utility function instead.'
    );
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
      console.warn(
        "Warning: '@itk-wasm/morphological-contour-interpolation' module not found. Please install it separately."
      );
      return operationData;
    }

    let inputImage;
    try {
      inputImage = await getItkImage(segmentationImageData, {
        imageName: 'interpolation',
        scalarData: segmentationVoxelManager.getCompleteScalarDataArray(),
      });
      if (!inputImage) {
        throw new Error('Failed to get ITK image');
      }
    } catch (error) {
      console.warn('Warning: Failed to get ITK image for interpolation');
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
