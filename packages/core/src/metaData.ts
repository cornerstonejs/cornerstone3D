// This module defines a way to access various metadata about an imageId.  This layer of abstraction exists
// So metadata can be provided in different ways (e.g. by parsing DICOM P10 or by a WADO-RS document)

const providers = [];

/**
 * Adds a metadata provider with the specified priority
 * @param provider - Metadata provider function
 * @param priority - 0 is default/normal, > 0 is high, < 0 is low
 *
 * @category MetaData
 */
export function addProvider(
  provider: (type: string, ...query: string[]) => any,
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

/**
 * Removes the specified provider
 *
 * @param provider - Metadata provider function
 *
 * @category MetaData
 */
export function removeProvider(
  provider: (type: string, query: any) => { any }
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
 *        Some metadata providers support multi-valued strings, which are interpretted
 *        as the provider chooses.
 *
 * @returns The metadata retrieved from the metadata store
 * @category MetaData
 */
function getMetaData(type: string, ...queries): any {
  // Invoke each provider in priority order until one returns something
  for (let i = 0; i < providers.length; i++) {
    const result = providers[i].provider(type, ...queries);

    if (result !== undefined) {
      return result;
    }
  }
}

export { getMetaData as get };
