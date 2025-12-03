import { MetadataModules } from '../../enums';
import { addTypedProvider } from '../../metaData';

const mapCacheData = new Map<string, Map<string, unknown>>();

/**
 * Creates a typed provider that caches results for the given type.
 *
 * Options can include: noCache to not cache this value or use the cached value,
 * and reCache to get a new value and add it to the cache.
 */
export function cacheDataForType(type: string) {
  return (next, query: string, data, options) => {
    let valueMap = mapCacheData.get(type);
    if (!valueMap) {
      valueMap = new Map<string, unknown>();
      mapCacheData.set(type, valueMap);
    }
    let value =
      options?.noCache !== true &&
      options?.reCache !== true &&
      valueMap.get(query);
    if (value !== undefined) {
      return value;
    }
    value = next(query, data, options);
    if (value !== undefined && !options?.noCache) {
      valueMap.set(query, value);
    }
    return value;
  };
}

export function clearCacheData() {
  mapCacheData.clear();
}

export function clearTypedCacheData(type: string, query?: string) {
  const valueMap = mapCacheData.get(type);
  if (!valueMap) {
    return;
  }
  if (query) {
    valueMap.delete(query);
  } else {
    valueMap.clear();
  }
}

addTypedProvider(
  MetadataModules.INSTANCE,
  cacheDataForType(MetadataModules.INSTANCE),
  {
    priority: 50_000,
    clear: clearCacheData,
    clearQuery: clearTypedCacheData.bind(null, MetadataModules.INSTANCE),
  }
);

addTypedProvider(
  MetadataModules.FRAME_MODULE,
  cacheDataForType(MetadataModules.FRAME_MODULE)
);
