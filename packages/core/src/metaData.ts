// This module defines a way to access various metadata about an imageId.  This layer of abstraction exists
// So metadata can be provided in different ways (e.g. by parsing DICOM P10 or by a WADO-RS document)

// Define an interface for the metadata provider
interface MetadataProvider {
  type: string;
  priority: number;
  provider: (type: string, ...query: string[]) => unknown;
}

const providers: MetadataProvider[] = [];

/**
 * Adds a metadata provider with the specified priority and type
 * @param provider - Metadata provider function
 * @param priority - 0 is default/normal, > 0 is high, < 0 is low
 * @param type - The type of the metadata provider
 *
 * @category MetaData
 */
export function addProvider(
  provider: (type: string, ...query: string[]) => unknown,
  priority = 0,
  type = 'default'
): void {
  let i;

  // Find the right spot to insert this provider based on priority
  for (i = 0; i < providers.length; i++) {
    if (providers[i].priority <= priority) {
      break;
    }
  }

  // Insert the provider at position i
  providers.splice(i, 0, {
    type,
    priority,
    provider,
  });
}

/**
 * Removes the specified provider
 *
 * @param provider - Metadata provider function
 * @param type - The type of the metadata provider to remove
 *
 * @category MetaData
 */
export function removeProvider(
  provider: (type: string, query: unknown) => unknown,
  type = 'default'
): void {
  for (let i = 0; i < providers.length; i++) {
    if (providers[i].provider === provider && providers[i].type === type) {
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
 * Gets metadata from the registered metadata providers of a specific type.
 * Will call each one from highest priority to lowest until one responds
 *
 * @param type - The type of metadata requested from the metadata store
 * @param providerType - The type of provider to query (default: 'default')
 * @param queries - The queries for the metadata store, often imageId
 *
 * @returns The metadata retrieved from the metadata store
 * @category MetaData
 */
function getMetaData(
  type: string,
  providerType = 'default',
  ...queries: string[]
): // eslint-disable-next-line @typescript-eslint/no-explicit-any
any {
  // Invoke each provider of the specified type in priority order until one returns something
  for (let i = 0; i < providers.length; i++) {
    if (providers[i].type === providerType) {
      const result = providers[i].provider(type, ...queries);

      if (result !== undefined) {
        return result;
      }
    }
  }
}

export { getMetaData as get };
