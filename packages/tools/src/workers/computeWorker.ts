import { expose } from 'comlink';
import VolumetricCalculator from '../utilities/segmentation/VolumetricCalculator';
import { peerImport } from '@cornerstonejs/core';
import getItkImage from '../tools/segmentation/strategies/utils/getItkImage';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

const computeWorker = {
  calculateSegmentsStatistics: (args) => {
    const { segmentationInfo, imageInfo, indices } = args;

    const {
      scalarData: segmentationScalarData,
      dimensions: segmentationDimensions,
      spacing: segmentationSpacing,
    } = segmentationInfo;
    const { scalarData: imageScalarData, dimensions: imageDimensions } =
      imageInfo;

    // if dimensions are not the same, for now just throw an error
    if (
      segmentationDimensions[0] !== imageDimensions[0] ||
      segmentationDimensions[1] !== imageDimensions[1] ||
      segmentationDimensions[2] !== imageDimensions[2]
    ) {
      throw new Error('Dimensions do not match');
    }

    for (let i = 0; i < segmentationScalarData.length; i++) {
      const segmentationValue = segmentationScalarData[i];

      if (indices.indexOf(segmentationValue) === -1) {
        continue;
      }
      const imageValue = imageScalarData[i];

      VolumetricCalculator.statsCallback({
        value: imageValue,
        pointIJK: [
          i % segmentationDimensions[0],
          Math.floor(i / segmentationDimensions[0]) % segmentationDimensions[1],
          Math.floor(i / segmentationDimensions[0] / segmentationDimensions[1]),
        ],
      });
    }

    const stats = VolumetricCalculator.getStatistics({
      spacing: segmentationSpacing,
      unit: 'mm',
    });

    return stats;
  },

  interpolateLabelmap: async (args) => {
    const { segmentationInfo, configuration } = args;
    const { scalarData, dimensions, spacing, origin, direction } =
      segmentationInfo;

    let itkModule;
    try {
      itkModule = await import('@itk-wasm/morphological-contour-interpolation');
      if (!itkModule) {
        throw new Error('Module not found');
      }
    } catch (error) {
      console.warn(
        "Warning: '@itk-wasm/morphological-contour-interpolation' module not found. Please install it separately."
      );
      return { data: scalarData };
    }

    const imageData = vtkImageData.newInstance();
    imageData.setDimensions(dimensions);
    imageData.setOrigin(origin);
    imageData.setDirection(direction || [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    imageData.setSpacing(spacing);

    const scalarArray = vtkDataArray.newInstance({
      name: 'Pixels',
      numberOfComponents: 1,
      values: scalarData,
    });

    imageData.getPointData().setScalars(scalarArray);
    imageData.modified();

    try {
      const inputImage = await getItkImage(imageData, {
        imageName: 'interpolation',
        scalarData: scalarData,
      });

      if (!inputImage) {
        throw new Error('Failed to get ITK image');
      }

      const { outputImage } = await itkModule.morphologicalContourInterpolation(
        inputImage,
        {
          ...configuration,
        }
      );

      const outputScalarData = outputImage.data;
      const modifiedScalarData = new Uint16Array(scalarData.length);

      // Copy the original data first
      modifiedScalarData.set(scalarData);

      // Only update values that are different
      for (let i = 0; i < outputScalarData.length; i++) {
        const newValue = outputScalarData[i];
        const originalValue = scalarData[i];

        if (newValue !== originalValue) {
          modifiedScalarData[i] = newValue;
        }
      }

      return { data: modifiedScalarData };
    } catch (error) {
      console.error(error);
      console.warn(
        'Warning: Failed to perform morphological contour interpolation'
      );
      return { data: scalarData };
    }
  },
};

expose(computeWorker);
