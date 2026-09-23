import metaDataManager from '../wadors/metaDataManager';

/**
 * Reads a retrieve option that may be given either as a value or as a callback
 * computing it from the image's metadata.
 *
 * `chunkSize` and `initialChunkSize` are both declared as
 * `number | ((metadata) => number)`, so every reader has to resolve the
 * callback form before using the result as a number - otherwise the function
 * itself flows into the arithmetic and silently produces NaN comparisons.
 */
export default function getRetrieveValue<T>(
  imageId: string,
  // The retrieve option interfaces have no index signature, and the deprecated
  // `minChunkSize` is not declared on them at all, so this reads them loosely
  // rather than making every call site cast.
  src: unknown,
  attr: string
): T {
  const value = (src as Record<string, unknown> | undefined)?.[attr];

  if (typeof value !== 'function') {
    return value as T;
  }

  const metaData = metaDataManager.get(imageId);

  return value(metaData, imageId) as T;
}
