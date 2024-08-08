import cache from '../cache';
import { Events } from '../enums';
import { canRenderFloatTextures } from '../init';
import { Point3 } from '../types';
import getScalingParameters from './getScalingParameters';
import { hasFloatScalingParameters } from './hasFloatScalingParameters';

function generateEmptyVolumeData(
  imageIds,
  metadata: {
    PixelRepresentation: number;
    PhotometricInterpretation: string;
    BitsAllocated: number;
    dimensions: Point3;
  }
) {
  const {
    PixelRepresentation,
    PhotometricInterpretation,
    BitsAllocated,
    dimensions,
  } = metadata;

  // For a streaming volume, the data type cannot rely on CSWIL to load
  // the proper array buffer type. This is because the target buffer container
  // must be decided ahead of time.
  // TODO: move this logic into CSWIL to avoid logic duplication.
  // We check if scaling parameters are negative we choose Int16 instead of
  // Uint16 for cases where BitsAllocated is 16.
  const imageIdIndex = Math.floor(imageIds.length / 2);
  const imageId = imageIds[imageIdIndex];
  const scalingParameters = getScalingParameters(imageId);

  const hasNegativeRescale =
    scalingParameters.rescaleIntercept < 0 ||
    scalingParameters.rescaleSlope < 0;

  // The prescale is ALWAYS used with modality LUT, so we can assume that
  // if the rescale slope is not an integer, we need to use Float32
  const floatAfterScale = hasFloatScalingParameters(scalingParameters);
  const canRenderFloat = canRenderFloatTextures();

  const signed = PixelRepresentation === 1;
  const numComponents = PhotometricInterpretation === 'RGB' ? 3 : 1;
  const length = dimensions[0] * dimensions[1] * dimensions[2];
  const handleCache = (sizeInBytes) => {
    if (!cache.isCacheable(sizeInBytes)) {
      throw new Error(Events.CACHE_SIZE_EXCEEDED);
    }
    cache.decacheIfNecessaryUntilBytesAvailable(sizeInBytes);
  };

  let scalarData, sizeInBytes;
  switch (BitsAllocated) {
    case 8:
      if (signed) {
        throw new Error(
          '8 Bit signed images are not yet supported by this plugin.'
        );
      }
      sizeInBytes = length * numComponents;
      handleCache(sizeInBytes);
      scalarData = new Uint8Array(length * numComponents);
      break;

    case 16:
      // Temporary fix for 16 bit images to use Float32
      // until the new dicom image loader handler the conversion
      // correctly
      if (canRenderFloat && floatAfterScale) {
        sizeInBytes = length * 4;
        scalarData = new Float32Array(length);

        break;
      }

      sizeInBytes = length * 2;
      if (signed || hasNegativeRescale) {
        handleCache(sizeInBytes);
        scalarData = new Int16Array(length);
        break;
      }

      if (!signed && !hasNegativeRescale) {
        handleCache(sizeInBytes);
        scalarData = new Uint16Array(length);
        break;
      }

      // Default to Float32 again
      sizeInBytes = length * 4;
      handleCache(sizeInBytes);
      scalarData = new Float32Array(length);
      break;

    case 24:
      sizeInBytes = length * numComponents;
      handleCache(sizeInBytes);

      // hacky because we don't support alpha channel in dicom
      scalarData = new Uint8Array(length * numComponents);
      break;
    case 32:
      sizeInBytes = length * 4;
      handleCache(sizeInBytes);
      scalarData = new Float32Array(length);
      break;
    default:
      throw new Error(
        `Bits allocated of ${BitsAllocated} is not defined to generate scalarData for the volume.`
      );
  }

  return { scalarData, sizeInBytes };
}

export { generateEmptyVolumeData };
