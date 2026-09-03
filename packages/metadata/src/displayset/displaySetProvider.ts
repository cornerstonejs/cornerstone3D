import { MetadataModules } from '../enums';
import { addAddProvider } from '../metaData';
import { addWritableCacheForType } from '../utilities/metadataProvider/cacheData';

function displaySetAddProvider(next, query: string, _data, options) {
  const displaySet = options?.displaySet;
  if (displaySet) {
    return displaySet;
  }
  return next(query, _data, options);
}

/**
 * Registers read/add typed providers for display set metadata.
 */
export function registerDisplaySetProviders() {
  addWritableCacheForType(MetadataModules.DISPLAY_SET);
  addAddProvider(MetadataModules.DISPLAY_SET, displaySetAddProvider, {
    priority: 40_000,
  });
}
