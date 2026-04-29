import { MetadataModules } from '../../enums';
import {
  addTypedProvider,
  clear,
  clearQuery,
  getMetaData,
} from '../../metaData';
import { BASE_IMAGE_ID, FRAME_IMAGE_IDS } from './imageIdsProviders';

const ASYNC_NATURALIZED = 'asyncNaturalized';

interface CacheGetOptions {
  noCache?: boolean;
  reCache?: boolean;
}

const DERIVED_TYPES_TO_CLEAR = new Set<string>([
  MetadataModules.INSTANCE,
  MetadataModules.URI_MODULE,
  MetadataModules.IMAGE_PLANE,
  MetadataModules.FRAME_MODULE,
  MetadataModules.GENERAL_IMAGE,
  MetadataModules.CALIBRATION,
  MetadataModules.COMPRESSED_FRAME_DATA,
  MetadataModules.SCALING,
]);

export class CacheData {
  protected static readonly mapCacheData = new Map<
    string,
    Map<string, unknown>
  >();
  protected static readonly inFlightByType = new Map<
    string,
    Map<string, Promise<unknown>>
  >();

  protected static setCacheDataInternal(
    type: string,
    query: string,
    value: unknown
  ) {
    let valueMap = this.mapCacheData.get(type);
    if (!valueMap) {
      valueMap = new Map<string, unknown>();
      this.mapCacheData.set(type, valueMap);
    }
    valueMap.set(query, value);
    if (type === MetadataModules.NATURALIZED) {
      this.clearRelatedDerivedCache(query);
      this.clearTypedCacheData(ASYNC_NATURALIZED, query);
    }
  }

  protected static clearRelatedDerivedCache(query: string) {
    const frameImageIds =
      (getMetaData(FRAME_IMAGE_IDS, query) as Set<string> | undefined) ??
      new Set<string>([query]);
    for (const frameImageId of frameImageIds) {
      for (const type of DERIVED_TYPES_TO_CLEAR) {
        const typeMap = this.mapCacheData.get(type);
        typeMap?.delete(frameImageId);
      }
    }
  }

  static getCacheData(type: string, query: string): unknown {
    return this.mapCacheData.get(type)?.get(query);
  }

  static hasCacheData(type: string, query: string): boolean {
    return this.mapCacheData.get(type)?.has(query) === true;
  }

  static clearCacheData() {
    this.mapCacheData.clear();
    this.inFlightByType.clear();
    clear(FRAME_IMAGE_IDS);
    clear(BASE_IMAGE_ID);
  }

  static clearTypedCacheData(type: string, query?: string) {
    const valueMap = this.mapCacheData.get(type);
    if (!valueMap) {
      return;
    }
    if (query) {
      valueMap.delete(query);
      this.inFlightByType.get(type)?.delete(query);
      if (type === MetadataModules.NATURALIZED) {
        clearQuery(FRAME_IMAGE_IDS, query);
        clearQuery(BASE_IMAGE_ID, query);
      }
      return;
    }
    valueMap.clear();
    this.inFlightByType.get(type)?.clear();
    if (type === MetadataModules.NATURALIZED) {
      clear(FRAME_IMAGE_IDS);
      clear(BASE_IMAGE_ID);
    }
  }

  static getAsyncCacheData(
    type: string,
    query: string
  ): Promise<unknown> | undefined {
    return this.inFlightByType.get(type)?.get(query);
  }

  static fromAsyncLookup<T>(
    type: string,
    query: string,
    lookup: () => T | Promise<T>,
    options?: CacheGetOptions
  ): T | Promise<T> | undefined {
    if (options?.noCache !== true && options?.reCache !== true) {
      const cachedValue = this.getCacheData(type, query);
      if (cachedValue !== undefined) {
        return cachedValue as T;
      }
    }
    if (options?.reCache !== true) {
      const inFlight = this.getAsyncCacheData(type, query);
      if (inFlight) {
        return inFlight as Promise<T>;
      }
    }

    const lookupValue = lookup();
    if (lookupValue === undefined) {
      return undefined;
    }
    if (!(lookupValue instanceof Promise)) {
      if (!options?.noCache) {
        this.setCacheDataInternal(type, query, lookupValue);
      }
      return lookupValue;
    }

    let inFlightForType = this.inFlightByType.get(type);
    if (!inFlightForType) {
      inFlightForType = new Map<string, Promise<unknown>>();
      this.inFlightByType.set(type, inFlightForType);
    }

    const managedPromise = lookupValue
      .then((resolvedValue) => {
        if (resolvedValue !== undefined && !options?.noCache) {
          this.setCacheDataInternal(type, query, resolvedValue);
        }
        return resolvedValue;
      })
      .finally(() => {
        inFlightForType?.delete(query);
      });
    inFlightForType.set(query, managedPromise);

    return managedPromise;
  }

  createTypeCacheProvider(type: string) {
    return createTypeCacheProvider(type);
  }

  clearCacheData() {
    CacheData.clearCacheData();
  }

  clearTypedCacheData(type: string, query?: string) {
    CacheData.clearTypedCacheData(type, query);
  }

  getCacheData(type: string, query: string) {
    return CacheData.getCacheData(type, query);
  }

  hasCacheData(type: string, query: string) {
    return CacheData.hasCacheData(type, query);
  }

  getAsyncCacheData(type: string, query: string) {
    return CacheData.getAsyncCacheData(type, query);
  }

  fromAsyncLookup<T>(
    type: string,
    query: string,
    lookup: () => T | Promise<T>,
    options?: CacheGetOptions
  ) {
    return CacheData.fromAsyncLookup(type, query, lookup, options);
  }
}

export class WritableCacheData extends CacheData {
  static setCacheData(type: string, query: string, value: unknown) {
    this.setCacheDataInternal(type, query, value);
  }

  setCacheData(type: string, query: string, value: unknown) {
    WritableCacheData.setCacheData(type, query, value);
  }
}

export const cacheData: CacheData = new WritableCacheData();

/**
 * Creates a typed provider that caches results for the given type.
 *
 * Options can include: noCache to not cache this value or use the cached value,
 * and reCache to get a new value and add it to the cache.
 */
export function createTypeCacheProvider(type: string) {
  return (next, query: string, data, options) => {
    return CacheData.fromAsyncLookup(
      type,
      query,
      () => next(query, data, options),
      options
    );
  };
}

export function clearCacheData() {
  CacheData.clearCacheData();
}

export function clearTypedCacheData(type: string, query?: string) {
  CacheData.clearTypedCacheData(type, query);
}

/**
 * Directly sets a value in the typed cache for the given type and query key.
 *
 * This is primarily an internal/advanced escape hatch for providers that need
 * explicit external writes (for example calibration-related providers). Most
 * metadata ingestion paths should use typed provider handlers instead.
 */
export function setCacheData(type: string, query: string, value: unknown) {
  WritableCacheData.setCacheData(type, query, value);
}

/**
 * Reads a value from the typed cache for the given type and query key.
 */
export function getCacheData(type: string, query: string): unknown {
  return CacheData.getCacheData(type, query);
}

export function hasCacheData(type: string, query: string): boolean {
  return CacheData.hasCacheData(type, query);
}

export function getAsyncCacheData(
  type: string,
  query: string
): Promise<unknown> | undefined {
  return CacheData.getAsyncCacheData(type, query);
}

export function fromAsyncLookup<T>(
  type: string,
  query: string,
  lookup: () => T | Promise<T>,
  options?: CacheGetOptions
) {
  return CacheData.fromAsyncLookup(type, query, lookup, options);
}

export function addCacheForType(type: string, options?) {
  addTypedProvider(type, createTypeCacheProvider(type), {
    priority: 50_000,
    clear: clearTypedCacheData.bind(null, type) as () => void,
    clearQuery: clearTypedCacheData.bind(null, type),
    ...options,
  });
}

export function registerCacheProviders() {
  addCacheForType(BASE_IMAGE_ID);
  addCacheForType(FRAME_IMAGE_IDS);
  addCacheForType(MetadataModules.NATURALIZED);
  addCacheForType(MetadataModules.INSTANCE);
  addCacheForType(MetadataModules.URI_MODULE);
  addCacheForType(MetadataModules.IMAGE_PLANE);
  addCacheForType(MetadataModules.FRAME_MODULE);
  addCacheForType(MetadataModules.GENERAL_IMAGE);
}
