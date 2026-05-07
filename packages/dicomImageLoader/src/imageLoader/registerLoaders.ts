import { cache } from '@cornerstonejs/core';
import { utilities, metaData } from '@cornerstonejs/metadata';

import dataSetCacheManager from './wadouri/dataSetCacheManager';
import wadouriRegister from './wadouri/register';
import wadorsRegister from './wadors/register';

/**
 * Register the WADO-URI and WADO-RS image loaders.
 * On each call (e.g. re-init), clears all relevant caches and providers so
 * the new registration is used consistently (ensures lifecycle and loader
 * tests see fresh requests for both legacy and NATURAL paths).
 *
 * @param options.useLegacyMetadataProvider - When true, registers the
 *   legacy wadouri/wadors metadata providers. Default is false (new design).
 */
function registerLoaders(options?: {
  useLegacyMetadataProvider?: boolean;
}): void {
  cache.purgeCache();
  dataSetCacheManager.purge();
  utilities.clearCacheData();
  metaData.removeAllProviders();

  wadorsRegister(options);
  wadouriRegister(options);
}

export default registerLoaders;
