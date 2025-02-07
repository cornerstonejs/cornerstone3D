import { peerImport } from '@cornerstonejs/core';
import getItkImage from '../../tools/segmentation/strategies/utils/getItkImage';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
// import PreviewMethods from '../../tools/segmentation/strategies/preview';
import getOrCreateSegmentationVolume from './getOrCreateSegmentationVolume';

type MorphologicalContourInterpolationOptions = {
  label?: number;
  axis?: number;
  noHeuristicAlignment?: boolean;
  noUseDistanceTransform?: boolean;
  useCustomSlicePositions?: boolean;
};

async function interpolateLabelmap({
  segmentationId,
  segmentIndex,
  configuration = { preview: false },
}: {
  segmentationId: string;
  segmentIndex: number;
  configuration: MorphologicalContourInterpolationOptions & {
    preview: boolean;
  };
}) {
  const { preview } = configuration;

  // if (preview) {
  //   const callback = ({ index }) => {
  //     segmentationVoxelManager.setAtIndex(index, segmentIndex);
  //   };
  //   previewVoxelManager.forEach(callback);
  // }

  const segVolume = getOrCreateSegmentationVolume(segmentationId);

  const {
    voxelManager: segmentationVoxelManager,
    imageData: segmentationImageData,
  } = segVolume;

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
    return;
  }

  const { voxelManager } = segmentationImageData.get('voxelManager');
  const scalarData = voxelManager.getCompleteScalarDataArray();

  let inputImage;
  try {
    inputImage = await getItkImage(segmentationImageData, {
      imageName: 'interpolation',
      scalarData,
    });
    if (!inputImage) {
      throw new Error('Failed to get ITK image');
    }
  } catch (error) {
    console.warn('Warning: Failed to get ITK image for interpolation');
    return;
  }

  const outputPromise = itkModule.morphologicalContourInterpolation(
    inputImage,
    {
      label: segmentIndex,
      webWorker: false,
    }
  );
  outputPromise.then((value) => {
    const { outputImage } = value;

    // const previewColors = operationData.configuration?.preview?.previewColors;
    // const assignIndex =
    //   previewSegmentIndex ?? (previewColors ? 255 : segmentIndex);
    // // Reset the colors - needs operation data set to do this
    // operationData.previewColors ||= previewColors;
    // operationData.previewSegmentIndex ||= previewColors ? 255 : undefined;
    // PreviewMethods[StrategyCallbacks.Initialize](operationData);

    const outputScalarData = outputImage.data;

    for (let i = 0; i < outputScalarData.length; i++) {
      const newValue = outputScalarData[i];
      const originalValue = scalarData[i];

      if (newValue === originalValue) {
        continue;
      }
      segmentationVoxelManager.setAtIndex(i, newValue);
    }

    triggerSegmentationDataModified(
      segmentationId,
      segmentationVoxelManager.getArrayOfModifiedSlices(),
      segmentIndex
    );
  });
}

export default interpolateLabelmap;
