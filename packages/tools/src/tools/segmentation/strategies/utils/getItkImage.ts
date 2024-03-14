import {
  Image,
  ImageType,
  IntTypes,
  FloatTypes,
  PixelTypes,
  Metadata,
} from 'itk-wasm';

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

/**
 * Get the ITK Image from the image data
 *
 * @param viewportId - Viewport Id
 * @param imageName - Any random name that shall be set in the image
 * @returns An ITK Image that can be used as fixed or moving image
 */
export default function getItkImage(imageData, imageName?: string): Image {
  const pointData = imageData.getPointData();
  const scalars = pointData.getScalars();
  const dimensions = imageData.getDimensions();
  const origin = imageData.getOrigin();
  const spacing = imageData.getSpacing();
  const directionArray = imageData.getDirection();
  const direction = new Float64Array(directionArray);
  const numComponents = pointData.getNumberOfComponents();
  const dataType = scalars
    .getDataType()
    .replace(/^Ui/, 'UI')
    .replace(/Array$/, '');
  const metadata: Metadata = undefined;
  const scalarData = scalars.getData();
  const imageType: ImageType = new ImageType(
    dimensions.length,
    dataTypesMap[dataType],
    PixelTypes.Scalar,
    numComponents
  );

  const image = new Image(imageType);

  image.name = imageName;
  image.origin = origin;
  image.spacing = spacing;
  image.direction = direction;
  image.size = dimensions;
  image.metadata = metadata;
  image.data = scalarData;

  // image.data = new scalarData.constructor(scalarData.length);
  // image.data.set(scalarData, 0);

  return image;
}
