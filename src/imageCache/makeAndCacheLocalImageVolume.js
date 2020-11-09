import cache, {
  getCacheSize,
  getMaxCacheSize,
  incrementCacheSize,
} from './cache';
import { uuidv4 } from '../utils';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import ImageVolume from './classes/ImageVolume.ts';

export default function makeAndCacheLocalImageVolume(properties = {}, uid) {
  if (uid === undefined) {
    uid = uuidv4();
  }

  const cachedVolume = cache.get(uid);

  if (cachedVolume) {
    return cachedVolume;
  }

  let {
    metadata,
    dimensions,
    spacing,
    origin,
    direction,
    scalarData,
  } = properties;

  const scalarLength = dimensions[0] * dimensions[1] * dimensions[2];

  // Check if it fits in the cache before we allocate data
  const currentCacheSize = getCacheSize();

  const byteLength = scalarData
    ? scalarData.buffer.byteLength
    : scalarLength * 4;

  if (currentCacheSize + byteLength > getMaxCacheSize()) {
    throw new Error(errorCodes.CACHE_SIZE_EXCEEDED);
  }

  if (scalarData) {
    if (
      !(scalarData instanceof Uint8Array) &&
      !(scalarData instanceof Float32Array)
    ) {
      throw new Error(
        `scalarData is not a Uint8Array or Float32Array, other array types currently unsupported.`
      );
    }
  } else {
    scalarData = new Float32Array(scalarLength);
  }

  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: 1,
    values: scalarData,
  });

  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(...dimensions);
  imageData.setSpacing(...spacing);
  imageData.setDirection(...direction);
  imageData.setOrigin(...origin);
  imageData.getPointData().setScalars(scalarArray);

  const volume = new ImageVolume({
    uid,
    metadata,
    dimensions,
    spacing,
    origin,
    direction,
    vtkImageData: imageData,
    scalarData: scalarData,
  });

  cache.set(uid, volume);
  incrementCacheSize(byteLength);

  return volume;
}
