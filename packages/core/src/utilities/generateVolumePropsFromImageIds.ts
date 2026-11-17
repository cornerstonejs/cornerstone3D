import { vec3 } from 'gl-matrix';
import makeVolumeMetadata from './makeVolumeMetadata';
import sortImageIdsAndGetSpacing from './sortImageIdsAndGetSpacing';
import type {
  ImageVolumeProps,
  Mat3,
  PixelDataTypedArrayString,
  Point3,
} from '../types';
import getScalingParameters from './getScalingParameters';
import { hasFloatScalingParameters } from './hasFloatScalingParameters';
import { canRenderFloatTextures } from '../init';
import cache from '../cache/cache';

// Map constructor names to PixelDataTypedArrayString
const constructorToTypedArray: Record<string, PixelDataTypedArrayString> = {
  Uint8Array: 'Uint8Array',
  Int16Array: 'Int16Array',
  Uint16Array: 'Uint16Array',
  Float32Array: 'Float32Array',
};
/**
 * Generates volume properties from a list of image IDs.
 *
 * @param imageIds - An array of image IDs.
 * @param volumeId - The ID of the volume.
 * @returns The generated ImageVolumeProps object.
 */
function generateVolumePropsFromImageIds(
  imageIds: string[],
  volumeId: string
): ImageVolumeProps {
  const volumeMetadata = makeVolumeMetadata(imageIds);

  const { ImageOrientationPatient, PixelSpacing, Columns, Rows } =
    volumeMetadata;

  const rowCosineVec = vec3.fromValues(
    ImageOrientationPatient[0],
    ImageOrientationPatient[1],
    ImageOrientationPatient[2]
  );
  const colCosineVec = vec3.fromValues(
    ImageOrientationPatient[3],
    ImageOrientationPatient[4],
    ImageOrientationPatient[5]
  );

  const scanAxisNormal = vec3.create();
  vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec);

  const { zSpacing, origin, sortedImageIds } = sortImageIdsAndGetSpacing(
    imageIds,
    scanAxisNormal
  );

  const numFrames = imageIds.length;

  // Spacing goes [1] then [0], as [1] is column spacing (x) and [0] is row spacing (y)
  const spacing = [PixelSpacing[1], PixelSpacing[0], zSpacing] as Point3;
  const dimensions = [Columns, Rows, numFrames].map((it) =>
    Math.floor(it)
  ) as Point3;
  const direction = [
    ...rowCosineVec,
    ...colCosineVec,
    ...scanAxisNormal,
  ] as Mat3;

  return {
    dimensions,
    spacing,
    origin,
    dataType: _determineDataType(sortedImageIds, volumeMetadata),
    direction,
    metadata: volumeMetadata,
    imageIds: sortedImageIds,
    volumeId,
    voxelManager: null,
    numberOfComponents:
      volumeMetadata.PhotometricInterpretation === 'RGB' ? 3 : 1,
  };
}

/**
 * Determines the appropriate data type based on bits allocated and other parameters.
 * @param BitsAllocated - The number of bits allocated for each pixel.
 * @param signed - Whether the data is signed.
 * @param canRenderFloat - Whether float rendering is supported.
 * @param floatAfterScale - Whether to use float after scaling.
 * @param hasNegativeRescale - Whether there's a negative rescale.
 * @returns The determined data type.
 */
function _determineDataType(
  imageIds: string[],
  volumeMetadata
): PixelDataTypedArrayString {
  const { BitsAllocated, PixelRepresentation } = volumeMetadata;
  const signed = PixelRepresentation === 1;

  // First try to get data type from cache if images are loaded
  const cachedDataType = _getDataTypeFromCache(imageIds);
  if (cachedDataType) {
    return cachedDataType;
  }

  // Check scaling parameters for first, middle, and last images
  const [firstIndex, middleIndex, lastIndex] = [
    0,
    Math.floor(imageIds.length / 2),
    imageIds.length - 1,
  ];

  const scalingParameters = [firstIndex, middleIndex, lastIndex].map((index) =>
    getScalingParameters(imageIds[index])
  );

  // Check if any image has negative rescale values
  const hasNegativeRescale = scalingParameters.some(
    (params) => params.rescaleIntercept < 0 || params.rescaleSlope < 0
  );

  // Check if any image has float scaling parameters
  const floatAfterScale = scalingParameters.some((params) =>
    hasFloatScalingParameters(params)
  );

  const canRenderFloat = canRenderFloatTextures();

  switch (BitsAllocated) {
    case 8:
      return 'Uint8Array';

    case 16:
    case 12:
      // Temporary fix for 16 bit images to use Float32
      if (canRenderFloat && floatAfterScale) {
        return 'Float32Array';
      }
      if (signed || hasNegativeRescale) {
        return 'Int16Array';
      }
      if (!signed && !hasNegativeRescale) {
        return 'Uint16Array';
      }
      return 'Float32Array';

    case 24:
      return 'Uint8Array';

    case 32:
      return 'Float32Array';

    case 64:
      return 'Float64Array';

    default:
      throw new Error(
        `Bits allocated of ${BitsAllocated} is not defined to generate scalarData for the volume.`
      );
  }
}

/**
 * Attempts to determine data type from cached images
 */
function _getDataTypeFromCache(
  imageIds: string[]
): PixelDataTypedArrayString | null {
  // Check first, middle and last images
  const indices = [0, Math.floor(imageIds.length / 2), imageIds.length - 1];
  const images = indices.map((i) => cache.getImage(imageIds[i]));

  // Return null if any images are missing
  if (!images.every(Boolean)) {
    return null;
  }

  // Get constructor name from first image's pixel data
  const constructorName = images[0].getPixelData().constructor.name;

  // Check if all images have same constructor and it's a valid type
  if (
    images.every(
      (img) => img.getPixelData().constructor.name === constructorName
    ) &&
    constructorName in constructorToTypedArray
  ) {
    return constructorToTypedArray[constructorName];
  }

  return null;
}

export { generateVolumePropsFromImageIds };
