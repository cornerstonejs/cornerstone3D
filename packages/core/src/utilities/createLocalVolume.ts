import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import cloneDeep from 'lodash.clonedeep';

import cache, { ImageVolume } from '../cache';
import { Events } from '../enums';
import { Mat3, Metadata, Point3 } from '../types';
import uuidv4 from './uuidv4';

interface LocalVolumeOptions {
  scalarData: Float32Array | Uint8Array;
  metadata: Metadata;
  dimensions: Point3;
  spacing: Point3;
  origin: Point3;
  direction: Mat3;
}

/**
 * Creates and cache a volume based on a set of provided properties including
 * dimensions, spacing, origin, direction, metadata, scalarData. It should be noted that
 * scalarData should be provided for this function to work. If a volume with the same
 * Id exists in the cache it returns it immediately.
 * @param options -  { scalarData, metadata, dimensions, spacing, origin, direction }
 * @param volumeURI - The volumeURI to be used for the volume. If not provided, a random one will be generated.
 *
 * @returns ImageVolume
 */
function createLocalVolume(
  options: LocalVolumeOptions,
  volumeURI: string,
  preventCache = false
): ImageVolume {
  const { scalarData, metadata, dimensions, spacing, origin, direction } =
    options;

  if (
    !scalarData ||
    !(scalarData instanceof Uint8Array || scalarData instanceof Float32Array)
  ) {
    throw new Error(
      'To use createLocalVolume you should pass scalarData of type Uint8Array or Float32Array'
    );
  }

  // Todo: handle default values for spacing, origin, direction if not provided
  if (volumeURI === undefined) {
    volumeURI = uuidv4();
  }

  const volumeId = `localVolume:${volumeURI}`;

  const cachedVolume = cache.getVolume(volumeId);

  if (cachedVolume) {
    return cachedVolume;
  }

  const scalarLength = dimensions[0] * dimensions[1] * dimensions[2];

  const numBytes = scalarData ? scalarData.buffer.byteLength : scalarLength * 4;

  // check if there is enough space in unallocated + image Cache
  const isCacheable = cache.isCacheable(numBytes);
  if (!isCacheable) {
    throw new Error(Events.CACHE_SIZE_EXCEEDED);
  }

  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: 1,
    values: scalarData,
  });

  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(dimensions);
  imageData.setSpacing(spacing);
  imageData.setDirection(direction);
  imageData.setOrigin(origin);
  imageData.getPointData().setScalars(scalarArray);

  const derivedVolume = new ImageVolume({
    volumeId: volumeURI,
    metadata: cloneDeep(metadata),
    dimensions: [dimensions[0], dimensions[1], dimensions[2]],
    spacing,
    origin,
    direction,
    imageData: imageData,
    scalarData,
    sizeInBytes: numBytes,
  });

  if (preventCache) {
    return derivedVolume;
  }

  const volumeLoadObject = {
    promise: Promise.resolve(derivedVolume),
  };
  cache.putVolumeLoadObject(volumeURI, volumeLoadObject);

  return derivedVolume;
}

export default createLocalVolume;
