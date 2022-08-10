import { cache, utilities, Enums } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import { makeVolumeMetadata, sortImageIdsAndGetSpacing } from './helpers';
import StreamingImageVolume from './StreamingImageVolume';

const { createUint8SharedArray, createFloat32SharedArray } = utilities;

interface IVolumeLoader {
  promise: Promise<StreamingImageVolume>;
  cancel: () => void;
}

/**
 * It handles loading of a image by streaming in its imageIds. It will be the
 * volume loader if the schema for the volumeID is `cornerstoneStreamingImageVolume`.
 * This function returns a promise that resolves to the StreamingImageVolume instance.
 *
 * In order to use the cornerstoneStreamingImageVolumeLoader you should use
 * createAndCacheVolume helper from the cornerstone-core volumeLoader module.
 *
 * @param volumeId - The ID of the volume
 * @param options - options for loading, imageIds
 * @returns a promise that resolves to a StreamingImageVolume
 */
function cornerstoneStreamingImageVolumeLoader(
  volumeId: string,
  options: {
    imageIds: string[];
  }
): IVolumeLoader {
  if (!options || !options.imageIds || !options.imageIds.length) {
    throw new Error(
      'ImageIds must be provided to create a streaming image volume'
    );
  }

  const { imageIds } = options;

  const volumeMetadata = makeVolumeMetadata(imageIds);

  const {
    BitsAllocated,
    PixelRepresentation,
    PhotometricInterpretation,
    ImageOrientationPatient,
    PixelSpacing,
    Columns,
    Rows,
  } = volumeMetadata;

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
  const spacing = <Types.Point3>[PixelSpacing[1], PixelSpacing[0], zSpacing];
  const dimensions = <Types.Point3>[Columns, Rows, numFrames];
  const direction = new Float32Array([
    ...rowCosineVec,
    ...colCosineVec,
    ...scanAxisNormal,
  ]);
  const signed = PixelRepresentation === 1;

  // Check if it fits in the cache before we allocate data
  // TODO Improve this when we have support for more types
  // NOTE: We use 4 bytes per voxel as we are using Float32.
  const bytesPerVoxel = BitsAllocated === 16 ? 4 : 1;
  const sizeInBytesPerComponent =
    bytesPerVoxel * dimensions[0] * dimensions[1] * dimensions[2];

  let numComponents = 1;
  if (PhotometricInterpretation === 'RGB') {
    numComponents = 3;
  }

  const sizeInBytes = sizeInBytesPerComponent * numComponents;

  // check if there is enough space in unallocated + image Cache
  const isCacheable = cache.isCacheable(sizeInBytes);
  if (!isCacheable) {
    throw new Error(Enums.Events.CACHE_SIZE_EXCEEDED);
  }

  cache.decacheIfNecessaryUntilBytesAvailable(sizeInBytes);

  let scalarData;

  switch (BitsAllocated) {
    case 8:
      if (signed) {
        throw new Error(
          '8 Bit signed images are not yet supported by this plugin.'
        );
      } else {
        scalarData = createUint8SharedArray(
          dimensions[0] * dimensions[1] * dimensions[2]
        );
      }

      break;

    case 16:
      scalarData = createFloat32SharedArray(
        dimensions[0] * dimensions[1] * dimensions[2]
      );

      break;

    case 24:
      // hacky because we don't support alpha channel in dicom
      scalarData = createUint8SharedArray(
        dimensions[0] * dimensions[1] * dimensions[2] * numComponents
      );

      break;
  }

  const streamingImageVolume = new StreamingImageVolume(
    // ImageVolume properties
    {
      volumeId,
      metadata: volumeMetadata,
      dimensions,
      spacing,
      origin,
      direction,
      scalarData,
      sizeInBytes,
    },
    // Streaming properties
    {
      imageIds: sortedImageIds,
      loadStatus: {
        // todo: loading and loaded should be on ImageVolume
        loaded: false,
        loading: false,
        cachedFrames: [],
        callbacks: [],
      },
    }
  );

  return {
    promise: Promise.resolve(streamingImageVolume),
    cancel: () => {
      streamingImageVolume.cancelLoading();
    },
  };
}

export default cornerstoneStreamingImageVolumeLoader;
