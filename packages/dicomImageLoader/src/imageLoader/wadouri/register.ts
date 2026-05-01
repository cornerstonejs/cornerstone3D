import { metaData, registerImageLoader, type Types } from '@cornerstonejs/core';
import { registerDefaultProviders } from '@cornerstonejs/metadata';

import { loadImage, loadImageFromNaturalizedMetadata } from './loadImage';
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
    registerImageLoader('dicomweb', loadImage);
    registerImageLoader('wadouri', loadImage);
    registerImageLoader('dicomfile', loadImage);
    metaData.addProvider(metaDataProvider);
    return;
  }

  // register dicomweb and wadouri image loader prefixes to loadImageFromNaturalizedMetadata
  // (dataSetCacheManager populates NATURAL via addPart10Instance when loading; returns IImage).
  registerImageLoader('dicomweb', loadImageFromNaturalizedMetadata);
  registerImageLoader('wadouri', loadImageFromNaturalizedMetadata);
  registerImageLoader('dicomfile', loadImageFromNaturalizedMetadata);

  registerDefaultProviders();
}

export { loadImageFromNaturalizedMetadata as loadImage } from './loadImage';
