import { expose } from 'comlink';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

/**
 * Dynamically imports ITK WASM modules needed for labelmap interpolation
 * @param moduleId - The module ID to import ('itk-wasm' or '@itk-wasm/morphological-contour-interpolation')
 * @returns Promise that resolves to the imported module
 */
async function peerImport(moduleId) {
  try {
    switch (moduleId) {
      case 'itk-wasm':
        return import('itk-wasm');
      case '@itk-wasm/morphological-contour-interpolation':
        return import('@itk-wasm/morphological-contour-interpolation');
      default:
        throw new Error(`Unknown module ID: ${moduleId}`);
    }
  } catch (error) {
    console.warn(`Error importing ${moduleId}:`, error);
    return null;
  }
}

const computeWorker = {
  getITKImage: async (args) => {
    const { imageData, options } = args;

    const { imageName, scalarData } = options;

    let Image, ImageType, IntTypes, FloatTypes, PixelTypes;

    try {
      const itkModule = await peerImport('itk-wasm');
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
    const { segmentationInfo, configuration } = args;
    const { scalarData, dimensions, spacing, origin, direction } =
      segmentationInfo;

    let itkModule;
    try {
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
