import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import cloneDeep from 'lodash.clonedeep';

import cache, { ImageVolume } from '../cache';
import { Events } from '../enums';
import uuidv4 from './uuidv4';

interface DerivedVolumeOptions {
  volumeURI: string;
  targetBuffer?: {
    type: 'Float32Array' | 'Uint8Array';
  };
}

/**
 * Based on a referencedVolumeId, it will build and cache a new volume. If
 * no scalarData is specified in the options, an empty derived volume will be
 * created that matches the image metadata of the referenceVolume. If scalarData
 * is given, it will be used to generate the intensity values for the derivedVolume.
 * Finally, it will save the volume in the cache.
 * @param referencedVolumeURI - the volumeURI from which the new volume will get its metadata
 * @param options - DerivedVolumeOptions {uid: derivedVolumeUID, targetBuffer: { type: FLOAT32Array | Uint8Array}, scalarData: if provided}
 *
 * @returns ImageVolume
 */
export function createAndCacheDerivedVolume(
  referencedVolumeURI: string,
  options: DerivedVolumeOptions
): ImageVolume {
  const referencedVolume = cache.getVolume(referencedVolumeURI);

  if (!referencedVolume) {
    throw new Error(
      `Cannot created derived volume: Referenced volume with URI of ${referencedVolumeURI} does not exist.`
    );
  }

  let { volumeURI } = options;
  const { targetBuffer } = options;

  if (volumeURI === undefined) {
    volumeURI = uuidv4();
  }

  const volumeId = 'derivedVolume:${volumeURI}';

  const { metadata, dimensions, spacing, origin, direction, scalarData } =
    referencedVolume;
  const scalarLength = scalarData.length;

  let numBytes, TypedArray;

  // If target buffer is provided
  if (targetBuffer) {
    if (targetBuffer.type === 'Float32Array') {
      numBytes = scalarLength * 4;
      TypedArray = Float32Array;
    } else if (targetBuffer.type === 'Uint8Array') {
      numBytes = scalarLength;
      TypedArray = Uint8Array;
    } else {
      throw new Error('TargetBuffer should be Float32Array or Uint8Array');
    }
  } else {
    // Use float32 if no targetBuffer is provided
    numBytes = scalarLength * 4;
    TypedArray = Float32Array;
  }

  // check if there is enough space in unallocated + image Cache
  const isCacheable = cache.isCacheable(numBytes);
  if (!isCacheable) {
    throw new Error(Events.CACHE_SIZE_EXCEEDED);
  }

  const volumeScalarData = new TypedArray(scalarLength);

  // Todo: handle more than one component for segmentation (RGB)
  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: 1,
    values: volumeScalarData,
  });

  const derivedImageData = vtkImageData.newInstance();

  derivedImageData.setDimensions(dimensions);
  derivedImageData.setSpacing(spacing);
  derivedImageData.setDirection(direction);
  derivedImageData.setOrigin(origin);
  derivedImageData.getPointData().setScalars(scalarArray);

  const derivedVolume = new ImageVolume({
    volumeId,
    metadata: cloneDeep(metadata),
    dimensions: [dimensions[0], dimensions[1], dimensions[2]],
    spacing,
    origin,
    direction,
    imageData: derivedImageData,
    scalarData: volumeScalarData,
    sizeInBytes: numBytes,
    referencedVolumeId: referencedVolumeURI,
  });

  const volumeLoadObject = {
    promise: Promise.resolve(derivedVolume),
  };
  cache.putVolumeLoadObject(volumeId, volumeLoadObject);

  return derivedVolume;
}

export default createAndCacheDerivedVolume;
