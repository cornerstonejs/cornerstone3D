import { cache } from '@cornerstonejs/core';
import { utilities } from '@cornerstonejs/metadata';

import dataSetCacheManager from './wadouri/dataSetCacheManager';
import wadorsMetaDataManager from './wadors/metaDataManager';
import wadouriRegister from './wadouri/register';
import wadorsRegister from './wadors/register';

/**
 * Register the WADO-URI and WADO-RS image loaders.
 * On each call (e.g. re-init), clears loader-owned caches so the new
 * registration is used consistently. Global metadata providers are preserved
 * because applications may register their providers before initializing the
 * DICOM image loader.
 *
 * @param options.useLegacyMetadataProvider - When true, registers the
 *   legacy wadouri/wadors metadata providers. Default is false (new design).
 */
function registerLoaders(options?: {
  useLegacyMetadataProvider?: boolean;
}): void {
  cache.purgeCache();
  dataSetCacheManager.purge();
  wadorsMetaDataManager.purge();
  utilities.clearCacheData();

  wadorsRegister(options);
  wadouriRegister(options);
}

export default registerLoaders;
