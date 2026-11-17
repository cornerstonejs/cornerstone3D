import { MetadataModules } from '../enums';
import { addAddProvider, addTypedProvider } from '../metaData';
import { addWritableCacheForType } from '../utilities/metadataProvider/cacheData';
import { displaySetStore } from './displaySetStore';

function displaySetAddProvider(next, query: string, _data, options) {
  const displaySet = options?.displaySet;
  if (displaySet) {
    return displaySet;
  }
  return next(query, _data, options);
}

/** Reads a display set uid from the store; other keys (imageIds) go on to the cache. */
function displaySetStoreProvider(next, query: string, data, options) {
  return (
    displaySetStore.getState().displaySets.get(query) ??
    next(query, data, options)
  );
}

/**
 * Registers read/add typed providers for display set metadata.
 */
export function registerDisplaySetProviders() {
  addWritableCacheForType(MetadataModules.DISPLAY_SET);
  addTypedProvider(MetadataModules.DISPLAY_SET, displaySetStoreProvider, {
    priority: 60_000,
  });
  addAddProvider(MetadataModules.DISPLAY_SET, displaySetAddProvider, {
    priority: 40_000,
  });
}
