import { metaData, registerImageLoader, type Types } from '@cornerstonejs/core';
import loadImage from './loadImage';
import { metaDataProvider } from './metaData';

export default function (options?: { useLegacyMetadataProvider?: boolean }) {
  // register wadors scheme image loader
  registerImageLoader('wadors', loadImage as unknown as Types.ImageLoaderFn);

  if (!options?.useLegacyMetadataProvider) {
    return;
  }

  /**
   * @deprecated The wadors metadata provider is deprecated.
   * Use addDicomwebInstance from @cornerstonejs/metadata to register
   * DICOMweb metadata directly into the NATURAL cache instead.
   * @see metadata-package.md
   */
  console.warn(
    'wadors metaDataProvider is deprecated. Use addDicomwebInstance from @cornerstonejs/metadata instead.'
  );
  metaData.addProvider(metaDataProvider);
}
