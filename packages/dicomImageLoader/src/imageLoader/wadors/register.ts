import { metaData, registerImageLoader, type Types } from '@cornerstonejs/core';
import loadImage from './loadImage';
import { metaDataProvider } from './metaData';
import { logging, registerDefaultProviders } from '@cornerstonejs/metadata';

const log = logging.loaderLog.getLogger('wadors');

/**
 * Registers the wadors scheme image loader, and either the
 * default metadata providers to use those, or the legacy metadata providers
 * when options?.useLegacyMetadataProvider is true.
 */
export default function (options?: { useLegacyMetadataProvider?: boolean }) {
  // register wadors scheme image loader
  registerImageLoader('wadors', loadImage as unknown as Types.ImageLoaderFn);

  if (options?.useLegacyMetadataProvider) {
    log.warn(
      'wadors metaDataProvider is deprecated. Use addDicomWebInstance from @cornerstonejs/metadata instead.'
    );
    metaData.addProvider(metaDataProvider);
    return;
  }

  registerDefaultProviders();
  metaData.addProvider(metaDataProvider);
}
