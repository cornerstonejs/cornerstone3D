// This module defines a way to access various metadata about an imageId.  This layer of abstraction exists
// So metadata can be provided in different ways (e.g. by parsing DICOM P10 or by a WADO-RS document)

const providers = []

/**
 * Adds a metadata provider with the specified priority
 * @param {Function} provider Metadata provider function
 * @param {Number} [priority=0] - 0 is default/normal, > 0 is high, < 0 is low
 *
 * @returns {void}
 *
 * @function addProvider
 * @category MetaData
 */
export function addProvider(
  provider: (type: string, imageId: string) => { any },
  priority = 0
): void {
  let i

  // Find the right spot to insert this provider based on priority
  for (i = 0; i < providers.length; i++) {
    if (providers[i].priority <= priority) {
      break
    }
  }

  // Insert the decode task at position i
  providers.splice(i, 0, {
    priority,
    provider,
  })
}

/**
 * Removes the specified provider
 *
 * @param {Function} provider Metadata provider function
 *
 * @returns {void}
 *
 * @function removeProvider
 * @category MetaData
 */
export function removeProvider(
  provider: (type: string, imageId: string) => { any }
): void {
  for (let i = 0; i < providers.length; i++) {
    if (providers[i].provider === provider) {
      providers.splice(i, 1)

      break
    }
  }
}

/**
 * Removes all providers
 *
 *
 * @returns {void}
 *
 * @function removeAllProviders
 * @category MetaData
 */
export function removeAllProviders(): void {
  while (providers.length > 0) {
    providers.pop()
  }
}

/**
 * Gets metadata from the registered metadata providers.  Will call each one from highest priority to lowest
 * until one responds
 *
 * @param {String} type The type of metadata requested from the metadata store
 * @param {String} imageId The Cornerstone Image Object's imageId
 *
 * @returns {*} The metadata retrieved from the metadata store
 * @category MetaData
 */
function getMetaData(type: string, imageId: string): any {
  // Invoke each provider in priority order until one returns something
  for (let i = 0; i < providers.length; i++) {
    const result = providers[i].provider(type, imageId)

    if (result !== undefined) {
      return result
    }
  }
}

const metaData = {
  addProvider,
  removeProvider,
  removeAllProviders,
  get: getMetaData,
}

export { metaData }

export default metaData
