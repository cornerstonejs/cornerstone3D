import cache, {
  getCacheSize,
  getMaxCacheSize,
  incrementCacheSize,
} from './cache';
import { uuidv4 } from './helpers';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';

export default function makeAndCacheDerivedVolume(
  referencedVolumeUID,
  options = {}
) {
  const referencedVolume = cache.get(referencedVolumeUID);

  if (!referencedVolume) {
    throw new Error(
      `Cannot created derived volume: Referenced volume with UID ${referencedVolumeUID} does not exist.`
    );
  }

  let { volumeScalarData, uid } = options;

  if (uid === undefined) {
    uid = uuidv4();
  }

  const {
    metadata,
    dimensions,
    spacing,
    origin,
    direction,
    scalarData,
  } = referencedVolume;

  const scalarLength = scalarData.length;

  // Check if it fits in the cache before we allocate data
  const currentCacheSize = getCacheSize();

  let byteLength;

  if (volumeScalarData) {
    byteLength = volumeScalarData.buffer.byteLength;
  } else {
    byteLength = scalarLength * 4;
  }

  if (currentCacheSize + byteLength > getMaxCacheSize()) {
    throw new Error(errorCodes.CACHE_SIZE_EXCEEDED);
  }

  if (volumeScalarData) {
    if (volumeScalarData.length !== scalarLength) {
      throw new Error(
        `volumeScalarData has incorrect length compared to source data. Length: ${volumeScalarData.length}, expected:scalarLength`
      );
    }

    if (
      !(volumeScalarData instanceof Uint8Array) &&
      !(volumeScalarData instanceof Float32Array)
    ) {
      throw new Error(
        `volumeScalarData is not a Uint8Array or Float32Array, other array types currently unsupported.`
      );
    }
  } else {
    volumeScalarData = new Float32Array(scalarLength);
  }

  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: 1,
    values: volumeScalarData,
  });

  const derivedImageData = vtkImageData.newInstance();

  derivedImageData.setDimensions(...dimensions);
  derivedImageData.setSpacing(...spacing);
  derivedImageData.setDirection(...direction);
  derivedImageData.setOrigin(...origin);
  derivedImageData.getPointData().setScalars(scalarArray);

  const derivedVolume = {
    uid,
    metadata,
    dimensions,
    spacing,
    origin,
    direction,
    vtkImageData: derivedImageData,
    scalarData: volumeScalarData,
  };

  cache.set(uid, derivedVolume);
  incrementCacheSize(byteLength);

  return derivedVolume;
}
