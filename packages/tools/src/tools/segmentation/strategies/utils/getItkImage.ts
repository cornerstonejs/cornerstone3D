import peerImport from '../../../../utilities/peerImport';

/**
 * Get the ITK Image from the image data
 *
 * @param viewportId - Viewport Id
 * @param imageName - Any random name that shall be set in the image
 * @returns An ITK Image that can be used as fixed or moving image
 */
export default async function getItkImage(
  imageData,
  options = { imageName: 'itkImage', scalarData: null }
): Promise<unknown> {
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
}
