import { cache, metaData } from '@cornerstonejs/core';
import { Enums, utilities } from '@cornerstonejs/metadata';

import dataSetCacheManager from './wadouri/dataSetCacheManager';
import wadouriRegister from './wadouri/register';
import wadorsRegister from './wadors/register';

/**
 * Register the WADO-URI and WADO-RS image loaders.
 *
 * @param options.useLegacyMetadataProvider - When true, registers the
 *   legacy wadouri/wadors metadata providers. Default is false (new design).
 */
function registerLoaders(options?: {
  useLegacyMetadataProvider?: boolean;
}): void {
  cache.purgeCache();
  dataSetCacheManager.purge();
  utilities.clearTypedCacheData(Enums.MetadataModules.NATURAL);
  metaData.removeAllProviders();

  wadorsRegister(options);
  wadouriRegister(options);
}

export default registerLoaders;
