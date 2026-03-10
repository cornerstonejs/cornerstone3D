import { metaData, registerImageLoader, type Types } from '@cornerstonejs/core';
import { registerDefaultProvider } from '@cornerstonejs/metadata';

import { loadImageFromDataSet, loadImageFromNatural } from './loadImage';
import { metaDataProvider } from './metaData/index';

/**
 * Registers the image loaders for Part 10 DICOM files, and either the
 * default metadata providers to use those, or the legacy metadata providers
 * when options?.useLegacyMetadataProvider is true.
 */
export default function (options?: {
  useLegacyMetadataProvider?: boolean;
}): void {
  if (options?.useLegacyMetadataProvider === true) {
    /**
     * @deprecated The wadouri metadata provider is deprecated.
     * Use addBinaryDicomInstance from @cornerstonejs/metadata to register
     * Part 10 binary metadata directly into the NATURAL cache instead.
     */
    console.warn(
      'wadouri metaDataProvider is deprecated. Use registerMetadataProvider module from @cornerstonejs/metadata instead.'
    );
    // register dicomweb and wadouri image loader prefixes and bind them
    // to the loadImage.  Note this registers both legacy and new metadata
    // loader, but the metadata provider is registered separately.
    registerImageLoader(
      'dicomweb',
      loadImageFromDataSet as unknown as Types.ImageLoaderFn
    );
    registerImageLoader(
      'wadouri',
      loadImageFromDataSet as unknown as Types.ImageLoaderFn
    );
    registerImageLoader(
      'dicomfile',
      loadImageFromDataSet as unknown as Types.ImageLoaderFn
    );
    metaData.addProvider(metaDataProvider);
    return;
  }

  // register dicomweb and wadouri image loader prefixes to loadImageFromNatural
  // (dataSetCacheManager populates NATURAL via addPart10Instance when loading; returns IImage).
  registerImageLoader(
    'dicomweb',
    loadImageFromNatural as unknown as Types.ImageLoaderFn
  );
  registerImageLoader(
    'wadouri',
    loadImageFromNatural as unknown as Types.ImageLoaderFn
  );
  registerImageLoader(
    'dicomfile',
    loadImageFromNatural as unknown as Types.ImageLoaderFn
  );

  registerDefaultProvider();
}

export { loadImageFromNatural as loadImage } from './loadImage';
