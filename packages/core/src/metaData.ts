// This module defines a way to access various metadata about an imageId.  This layer of abstraction exists
// So metadata can be provided in different ways (e.g. by parsing DICOM P10 or by a WADO-RS document)

const providers = [];

const typedProviderValueMap = new Map<string, TypedProviderValue[]>();

const typedProviderMap = new Map<string, TypedProviderBound>();

export type TypedProviderValue = {
  provider: TypedProvider;
  priority: number;
  isDefault: boolean;
  /** Clears any data from this instance */
  clear?: () => void;
  /** Clears just this type/query pair */
  clearQuery?: (query: string) => void;
};

export type TypedProvider = (
  next: TypedProviderBound,
  query: string,
  data?,
  options?
) => unknown;

export type TypedProviderBound = (query: string, data?, options?) => unknown;

/**
 * Adds a metadata provider with the specified priority
 * @param provider - Metadata provider function
 * @param priority - 0 is default/normal, > 0 is high, < 0 is low
 *
 * @category MetaData
 */
export function addProvider(
  provider: (type: string, ...query: string[]) => unknown,
  priority = 0
): void {
  let i;

  // Find the right spot to insert this provider based on priority
  for (i = 0; i < providers.length; i++) {
    if (providers[i].priority <= priority) {
      break;
    }
  }

  // Insert the decode task at position i
  providers.splice(i, 0, {
    priority,
    provider,
  });
}

const nullProvider = (_query, _data, options) => options?.defaultValue;

function insertPriority(
  type: string,
  list,
  provider,
  options
): TypedProviderBound {
  const providerValue = { type, ...options, provider };
  if (!list.find((it) => it.provider === provider)) {
    let i;
    const { priority = 0 } = options;

    // Find the right spot to insert this provider based on priority
    for (i = 0; i < list.length; i++) {
      if (list[i].priority <= priority) {
        break;
      }
    }

    // Insert the decode task at position i
    list.splice(i, 0, providerValue);
  }

  let currentProvider = nullProvider;
  for (let i = list.length - 1; i >= 0; i--) {
    currentProvider = list[i].provider.bind(null, currentProvider);
  }
  return currentProvider;
}

export interface TypedProviderOptions {
  priority?: number;
  requires?: string[];
  isDefault?: boolean;
  clear?: () => void;
  clearQuery?: (query: string) => void;
}

/**
 * Adds a typed provider at the given priority level
 *
 * Typed providers all run as part of the standard  provider framework at
 * priority -1000.  They differ from regular providers in that each provider
 * function handles exactly one type
 *
 * Note: All typed providers are included overall at priority "-1000" with the
 * global priority - that is, at the last item so that the existing non-typed
 * providers all run first.
 */
export function addTypedProvider(
  type: string,
  provider: TypedProvider,
  options: TypedProviderOptions = { priority: 0, isDefault: true }
) {
  let list = typedProviderValueMap.get(type);
  if (!list) {
    list = new Array<TypedProviderValue>();
    typedProviderValueMap.set(type, list);
  }
  const newProvider = insertPriority(type, list, provider, options);
  if (!newProvider) {
    throw new Error(`newProvider is empty for ${type}`);
  }
  typedProviderMap.set(type, newProvider);
}

/**
 * A provider for the general typed providers.
 */
export function typedProviderProvider(type: string, query: string, options) {
  const typedProvider = typedProviderMap.get(type);
  if (!typedProvider) {
    // console.warn('No typed provider for', type, query);
    return;
  }
  const result = typedProvider(query, null, options);
  // if (!result) {
  //   console.warn('Typed provider called but no result', type, query);
  // } else {
  //   // console.warn('Typed provider found', type, result);
  // }
  return result;
}

addProvider(typedProviderProvider, -1000);

/**
 * Removes the specified provider
 *
 * @param provider - Metadata provider function
 *
 * @category MetaData
 */
export function removeProvider(
  provider: (type: string, query: unknown) => unknown
): void {
  for (let i = 0; i < providers.length; i++) {
    if (providers[i].provider === provider) {
      providers.splice(i, 1);

      break;
    }
  }
}

/**
 * Removes all providers
 *
 * @category MetaData
 */
export function removeAllProviders(): void {
  while (providers.length > 0) {
    providers.pop();
  }
}

/**
 * Gets metadata from the registered metadata providers.  Will call each one from highest priority to lowest
 * until one responds
 *
 * @param type -  The type of metadata requested from the metadata store
 * @param query - The query for the metadata store, often imageId
 *        Some metadata providers support multi-valued strings, which are interpreted
 *        as the provider chooses.
 *
 * @returns The metadata retrieved from the metadata store
 * @category MetaData
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getMetaData(type: string, query: string, options?): any {
  // Invoke each provider in priority order until one returns something
  for (let i = 0; i < providers.length; i++) {
    const result = providers[i].provider(type, query, options);
    if (result !== undefined) {
      return result;
    }
  }
  // console.warn("Didn't find metadata", type, query);
}

/**
 * Clears cached data on the specific type
 * and query key
 */
export const clearQuery = (type: string, query?: string) => {
  const typedProviders = typedProviderValueMap.get(type);
  if (!typedProviders) {
    return;
  }
  for (const providerInfo of typedProviders) {
    providerInfo?.clearQuery?.(query);
  }
};

/**
 * Clears cached data on the specific type
 * and query key
 */
export const clear = (type: string) => {
  const typedProviders = typedProviderValueMap.get(type);
  if (!typedProviders) {
    return;
  }
  for (const providerInfo of typedProviders) {
    providerInfo?.clear?.();
  }
};

export const get = (type: string, ...queries: string[]) =>
  queries.length === 1
    ? getMetaData(type, queries[0])
    : queries
        .map((query) => getMetaData(type, query))
        .find((it) => it !== undefined);

/**
 * Retrieves metadata from a DICOM image and returns it as an object with capitalized keys.
 * @param imageId - the imageId
 * @param metaDataProvider - The metadata provider either wadors or wadouri
 * @param types - An array of metadata types to retrieve.
 * @returns An object containing the retrieved metadata with capitalized keys.
 */
export function getNormalized(
  imageId: string,
  types: string[],
  metaDataProvider = getMetaData
) {
  const result = {};
  for (const t of types) {
    try {
      const data = metaDataProvider(t, imageId);
      if (data) {
        const capitalizedData = {};
        for (const key in data) {
          if (key in data) {
            const capitalizedKey = toUpperCamelTag(key);
            capitalizedData[capitalizedKey] = data[key];
          }
        }
        Object.assign(result, capitalizedData);
      }
    } catch (error) {
      console.error(`Error retrieving ${t} data:`, error);
    }
  }

  return result;
}

/**
 * Converts a tag name to UpperCamelCase
 */
export const toUpperCamelTag = (tag: string) => {
  if (tag.startsWith('sop')) {
    return `SOP${tag.substring(3)}`;
  }
  if (tag.startsWith('voi')) {
    return `VOI${tag.substring(3)}`;
  }
  if (tag.endsWith('Id')) {
    tag = `${tag.substring(0, tag.length - 2)}ID`;
  }
  return tag.charAt(0).toUpperCase() + tag.slice(1);
};

/**
 * Converts a tag name to lowerCamelCase
 */
export const toLowerCamelTag = (tag: string) => {
  if (tag.startsWith('SOP')) {
    return `sop${tag.substring(3)}`;
  }
  if (tag.startsWith('VOI')) {
    return `voi${tag.substring(3)}`;
  }
  if (tag.endsWith('ID') && !tag.endsWith('UID')) {
    tag = `${tag.substring(0, tag.length - 2)}Id`;
  }
  return tag.charAt(0).toLowerCase() + tag.slice(1);
};
