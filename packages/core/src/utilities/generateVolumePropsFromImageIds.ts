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
import * as metaData from '../metaData';
import { MetadataModules } from '../enums';

/**
 * The geometry of the volume that a series of images makes, from their
 * metadata only: no pixel is loaded. It reads the `imagePlaneModule` of the
 * images: `imageOrientationPatient`, `pixelSpacing`, `rows` and `columns` of
 * the first image, and `imagePositionPatient` of each image, by which the
 * images are sorted along the scan axis and their spacing is measured.
 *
 * @param imageIds - The image ids of the series.
 * @returns The dimensions, the spacing, the origin and the direction of the
 * volume, and its image ids in the order of its slices.
 */
function getVolumeGeometryFromImageIds(imageIds: string[]): {
  dimensions: Point3;
  spacing: Point3;
  origin: Point3;
  direction: Mat3;
  sortedImageIds: string[];
} {
  const { imageOrientationPatient, pixelSpacing, columns, rows } = metaData.get(
    MetadataModules.IMAGE_PLANE,
    imageIds[0]
  );

  const rowCosineVec = vec3.fromValues(
    imageOrientationPatient[0],
    imageOrientationPatient[1],
    imageOrientationPatient[2]
  );
  const colCosineVec = vec3.fromValues(
    imageOrientationPatient[3],
    imageOrientationPatient[4],
    imageOrientationPatient[5]
  );

  const scanAxisNormal = vec3.create();
  vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec);

  const { zSpacing, origin, sortedImageIds } = sortImageIdsAndGetSpacing(
    imageIds,
    scanAxisNormal
  );

  const numFrames = imageIds.length;

  // Spacing goes [1] then [0], as [1] is column spacing (x) and [0] is row spacing (y)
  const spacing = [pixelSpacing[1], pixelSpacing[0], zSpacing] as Point3;
  const dimensions = [columns, rows, numFrames].map((it) =>
    Math.floor(it)
  ) as Point3;
  const direction = [
    ...rowCosineVec,
    ...colCosineVec,
    ...scanAxisNormal,
  ] as Mat3;

  return { dimensions, spacing, origin, direction, sortedImageIds };
}

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
  const { dimensions, spacing, origin, direction, sortedImageIds } =
    getVolumeGeometryFromImageIds(imageIds);

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

export { generateVolumePropsFromImageIds, getVolumeGeometryFromImageIds };
