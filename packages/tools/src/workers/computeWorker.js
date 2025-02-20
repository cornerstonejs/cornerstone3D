import { expose } from 'comlink';
import VolumetricCalculator from '../utilities/segmentation/VolumetricCalculator';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

export async function peerImport(moduleId, enableLabelmapInterpolation) {
  if (moduleId === 'itk-wasm') {
    if (enableLabelmapInterpolation) {
      return import('itk-wasm');
    } else {
      const moduleName = 'itk-wasm';
      return import(
        /* webpackChunkName: "itk-wasm-morphological-contour-interpolation" */
        `${moduleName}`
      );
    }
  }
  if (moduleId === '@itk-wasm/morphological-contour-interpolation') {
    if (enableLabelmapInterpolation) {
      return import('@itk-wasm/morphological-contour-interpolation');
    } else {
      const moduleName = '@itk-wasm/morphological-contour-interpolation';
      return import(
        /* webpackChunkName: "itk-wasm-morphological-contour-interpolation" */
        `${moduleName}`
      );
    }
  }
}

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

  getITKImage: async (args) => {
    const { imageData, options, enableLabelmapInterpolation } = args;

    const { imageName, scalarData } = options;

    let Image, ImageType, IntTypes, FloatTypes, PixelTypes;

    try {
      const itkModule = await peerImport(
        'itk-wasm',
        enableLabelmapInterpolation
      );
      if (!itkModule) {
        throw new Error('Module not found');
      }
      ({ Image, ImageType, IntTypes, FloatTypes, PixelTypes } = itkModule);
    } catch (error) {
      console.warn(
        "Warning: 'itk-wasm' module not found. Please install it separately."
      );
      return null;
    }

    const dataTypesMap = {
      Int8: IntTypes.Int8,
      UInt8: IntTypes.UInt8,
      Int16: IntTypes.Int16,
      UInt16: IntTypes.UInt16,
      Int32: IntTypes.Int32,
      UInt32: IntTypes.UInt32,
      Int64: IntTypes.Int64,
      UInt64: IntTypes.UInt64,
      Float32: FloatTypes.Float32,
      Float64: FloatTypes.Float64,
    };

    const { numberOfComponents } = imageData.get('numberOfComponents');

    const dimensions = imageData.getDimensions();
    const origin = imageData.getOrigin();
    const spacing = imageData.getSpacing();
    const directionArray = imageData.getDirection();
    const direction = new Float64Array(directionArray);
    const dataType = scalarData.constructor.name
      .replace(/^Ui/, 'UI')
      .replace(/Array$/, '');
    const metadata = undefined;

    const imageType = new ImageType(
      dimensions.length,
      dataTypesMap[dataType],
      PixelTypes.Scalar,
      numberOfComponents
    );

    const image = new Image(imageType);
    image.name = imageName;
    image.origin = origin;
    image.spacing = spacing;
    image.direction = direction;
    image.size = dimensions;
    image.metadata = metadata;
    image.data = scalarData;

    return image;
  },
  interpolateLabelmap: async (args) => {
    const { segmentationInfo, configuration, enableLabelmapInterpolation } =
      args;
    const { scalarData, dimensions, spacing, origin, direction } =
      segmentationInfo;

    let itkModule;
    try {
      itkModule = await peerImport(
        '@itk-wasm/morphological-contour-interpolation',
        enableLabelmapInterpolation
      );
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
      const inputImage = await computeWorker.getITKImage({
        imageData,
        options: {
          imageName: 'interpolation',
          scalarData: scalarData,
        },
        enableLabelmapInterpolation,
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
