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
  const dimensions = [Columns, Rows, numFrames] as Point3;
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
  imageIds,
  volumeMetadata
): PixelDataTypedArrayString {
  const { BitsAllocated, PixelRepresentation, PhotometricInterpretation } =
    volumeMetadata;

  const signed = PixelRepresentation === 1;

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

  switch (BitsAllocated) {
    case 8:
      if (signed) {
        throw new Error(
          '8 Bit signed images are not yet supported by this plugin.'
        );
      }
      return 'Uint8Array';

    case 16:
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

    default:
      throw new Error(
        `Bits allocated of ${BitsAllocated} is not defined to generate scalarData for the volume.`
      );
  }
}

export { generateVolumePropsFromImageIds };
