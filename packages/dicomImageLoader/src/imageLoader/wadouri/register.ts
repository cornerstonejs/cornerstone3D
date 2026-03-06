import { metaData, registerImageLoader, type Types } from '@cornerstonejs/core';
import { loadImage } from './loadImage';
import { metaDataProvider } from './metaData/index';

export default function (options?: {
  useLegacyMetadataProvider?: boolean;
}): void {
  // register dicomweb and wadouri image loader prefixes
  registerImageLoader('dicomweb', loadImage as unknown as Types.ImageLoaderFn);
  registerImageLoader('wadouri', loadImage as unknown as Types.ImageLoaderFn);
  registerImageLoader('dicomfile', loadImage as unknown as Types.ImageLoaderFn);

  // Default to true so that wadouri/dicomfile loading works without requiring
  // the app to pre-register metadata via addBinaryDicomInstance. Set to false
  // when the app populates the NATURAL cache before loading (e.g. file upload).
  const useLegacy = options?.useLegacyMetadataProvider !== false;

  if (!useLegacy) {
    return;
  }

  if (options?.useLegacyMetadataProvider === true) {
    /**
     * @deprecated The wadouri metadata provider is deprecated.
     * Use addBinaryDicomInstance from @cornerstonejs/metadata to register
     * Part 10 binary metadata directly into the NATURAL cache instead.
     */
    console.warn(
      'wadouri metaDataProvider is deprecated. Use addBinaryDicomInstance from @cornerstonejs/metadata instead.'
    );
  }
  metaData.addProvider(metaDataProvider);
}
