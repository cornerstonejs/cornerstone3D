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
 * The array type of a volume: the type that holds every value that the
 * series can hold, read from its metadata (bits allocated, bits stored,
 * pixel representation, and the modality LUT and the scaling of the first,
 * the middle and the last image), and never from the values of the images.
 * An image that a stack loaded before has the smallest type that holds its
 * own values (a 12 bit image whose values are all below 256 is a
 * `Uint8Array`), so its type says nothing of the other images of the series.
 * Unsigned 16 bit data with 8 bits stored, whose modality LUT keeps it below
 * 256, is a `Uint8Array`.
 *
 * @param imageIds - The image ids of the volume, sorted.
 * @param volumeMetadata - The metadata of the volume (`makeVolumeMetadata`).
 * @returns The array type of the volume.
 */
function _determineDataType(
  imageIds: string[],
  volumeMetadata
): PixelDataTypedArrayString {
  const { BitsAllocated, BitsStored, PixelRepresentation } = volumeMetadata;
  const signed = PixelRepresentation === 1;

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
      // Temporary fix for 16 bit images to use Float32
      if (canRenderFloat && floatAfterScale) {
        return 'Float32Array';
      }
      if (signed || hasNegativeRescale) {
        return 'Int16Array';
      }
      if (
        BitsStored <= 8 &&
        scalingParameters.every(
          ({ rescaleSlope, rescaleIntercept }) =>
            (2 ** BitsStored - 1) * rescaleSlope + rescaleIntercept <= 255
        )
      ) {
        return 'Uint8Array';
      }
      return 'Uint16Array';

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

export { generateVolumePropsFromImageIds };
