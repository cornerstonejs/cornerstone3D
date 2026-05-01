import { getAddModuleType, MetadataModules } from '../../enums';
import {
  addAddProvider,
  addTypedProvider,
  clear,
  clearQuery,
  getMetaData,
} from '../../metaData';
import { BASE_IMAGE_ID, FRAME_IMAGE_IDS } from './imageIdsProviders';

interface CacheGetOptions {
  noCache?: boolean;
  reCache?: boolean;
}

type CacheRegistrationOptions = CacheGetOptions & {
  /** Register this cache type as secondary of one or more base cache types. */
  secondaryOf?: string | string[];
};

export class CacheData {
  protected static readonly mapCacheData = new Map<
    string,
    Map<string, unknown>
  >();
  protected static readonly secondaryTypesByBaseType = new Map<
    string,
    Set<string>
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
    this.clearRelatedDerivedCache(type, query);
  }

  protected static clearRelatedDerivedCache(type: string, query: string) {
    const derivedTypes = this.secondaryTypesByBaseType.get(type);
    if (!derivedTypes?.size) {
      return;
    }
    const frameImageIds =
      (getMetaData(FRAME_IMAGE_IDS, query) as Set<string> | undefined) ??
      new Set<string>([query]);
    for (const frameImageId of frameImageIds) {
      for (const derivedType of derivedTypes) {
        const typeMap = this.mapCacheData.get(derivedType);
        typeMap?.delete(frameImageId);
      }
    }
  }

  static registerSecondaryTypes(
    secondaryType: string,
    secondaryOf?: string | string[]
  ) {
    if (!secondaryOf) {
      return;
    }
    const baseTypes = Array.isArray(secondaryOf) ? secondaryOf : [secondaryOf];
    for (const baseType of baseTypes) {
      let secondaryTypes = this.secondaryTypesByBaseType.get(baseType);
      if (!secondaryTypes) {
        secondaryTypes = new Set<string>();
        this.secondaryTypesByBaseType.set(baseType, secondaryTypes);
      }
      secondaryTypes.add(secondaryType);
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
    this.secondaryTypesByBaseType.clear();
    clear(FRAME_IMAGE_IDS);
    clear(BASE_IMAGE_ID);
  }

  static clearTypedCacheData(type: string, query?: string) {
    const secondaryTypes = this.secondaryTypesByBaseType.get(type);
    const valueMap = this.mapCacheData.get(type);

    if (query) {
      valueMap?.delete(query);

      if (secondaryTypes?.size) {
        for (const secondaryType of secondaryTypes) {
          this.mapCacheData.get(secondaryType)?.delete(query);
        }
      }

      if (type === MetadataModules.NATURALIZED || secondaryTypes?.size) {
        clearQuery(FRAME_IMAGE_IDS, query);
        clearQuery(BASE_IMAGE_ID, query);
      }
      return;
    }
    valueMap?.clear();
    if (secondaryTypes?.size) {
      for (const secondaryType of secondaryTypes) {
        this.mapCacheData.get(secondaryType)?.clear();
      }
    }
    if (type === MetadataModules.NATURALIZED || secondaryTypes?.size) {
      clear(FRAME_IMAGE_IDS);
      clear(BASE_IMAGE_ID);
    }
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

    return lookupValue.then((resolvedValue) => {
      if (resolvedValue !== undefined && !options?.noCache) {
        this.setCacheDataInternal(type, query, resolvedValue);
      }
      return resolvedValue;
    });
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

export function createTypeWritableCacheProvider(type: string) {
  const addType = getAddModuleType(type);

  return (next, query: string, data, options) => {
    const cachedValue = CacheData.getCacheData(type, query);
    if (cachedValue !== undefined) {
      console.warn(
        `Metadata add skipped for "${type}" at query "${query}" because cache already has a value.`
      );
      return cachedValue;
    }

    const addCachedValue = CacheData.getCacheData(addType, query);
    if (addCachedValue !== undefined) {
      return addCachedValue;
    }

    const nextValue = next(query, data, options);
    if (nextValue === undefined) {
      return undefined;
    }

    if (!(nextValue instanceof Promise)) {
      WritableCacheData.setCacheData(type, query, nextValue);
      return nextValue;
    }

    const managedPromise = nextValue
      .then((resolvedValue) => {
        if (resolvedValue !== undefined) {
          WritableCacheData.setCacheData(type, query, resolvedValue);
        }
        return resolvedValue;
      })
      .finally(() => {
        CacheData.clearTypedCacheData(addType, query);
      });

    WritableCacheData.setCacheData(addType, query, managedPromise);

    return managedPromise;
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

export function fromAsyncLookup<T>(
  type: string,
  query: string,
  lookup: () => T | Promise<T>,
  options?: CacheGetOptions
) {
  return CacheData.fromAsyncLookup(type, query, lookup, options);
}

export function addCacheForType(type: string, options?) {
  const { secondaryOf, ...providerOptions } = (options ??
    {}) as CacheRegistrationOptions;

  CacheData.registerSecondaryTypes(type, secondaryOf);

  addTypedProvider(type, createTypeCacheProvider(type), {
    priority: 50_000,
    clear: clearTypedCacheData.bind(null, type) as () => void,
    clearQuery: clearTypedCacheData.bind(null, type),
    ...providerOptions,
  });
}

export function addWritableCacheForType(type: string, options?) {
  const addType = getAddModuleType(type);
  const { secondaryOf, ...providerOptions } = (options ??
    {}) as CacheRegistrationOptions;

  addCacheForType(type, { secondaryOf, ...providerOptions });
  CacheData.registerSecondaryTypes(addType, type);

  addAddProvider(type, createTypeWritableCacheProvider(type), {
    priority: 50_000,
    clear: clearTypedCacheData.bind(null, addType) as () => void,
    clearQuery: clearTypedCacheData.bind(null, addType),
    ...providerOptions,
  });
}

export function registerCacheProviders() {
  addCacheForType(BASE_IMAGE_ID);
  addCacheForType(FRAME_IMAGE_IDS);
  addWritableCacheForType(MetadataModules.NATURALIZED);
  addCacheForType(MetadataModules.INSTANCE, {
    secondaryOf: MetadataModules.NATURALIZED,
  });
  addCacheForType(MetadataModules.URI_MODULE, {
    secondaryOf: MetadataModules.NATURALIZED,
  });
  addCacheForType(MetadataModules.IMAGE_PLANE, {
    secondaryOf: MetadataModules.NATURALIZED,
  });
  addCacheForType(MetadataModules.FRAME_MODULE, {
    secondaryOf: MetadataModules.NATURALIZED,
  });
  addCacheForType(MetadataModules.GENERAL_IMAGE, {
    secondaryOf: MetadataModules.NATURALIZED,
  });
}
