import { metaData, registerImageLoader, type Types } from '@cornerstonejs/core';
import { loadImage } from './loadImage';
import { metaDataProvider } from './metaData/index';

export default function (options?: { useMetadataProvider?: boolean }): void {
  // register dicomweb and wadouri image loader prefixes
  registerImageLoader('dicomweb', loadImage as unknown as Types.ImageLoaderFn);
  registerImageLoader('wadouri', loadImage as unknown as Types.ImageLoaderFn);
  registerImageLoader('dicomfile', loadImage as unknown as Types.ImageLoaderFn);

  if (options?.useMetadataProvider) {
    return;
  }

  /**
   * @deprecated The wadouri metadata provider is deprecated.
   * Use addBinaryDicomInstance from @cornerstonejs/metadata to register
   * Part 10 binary metadata directly into the INSTANCE_ORIG cache instead.
   */
  console.warn(
    'wadouri metaDataProvider is deprecated. Use addBinaryDicomInstance from @cornerstonejs/metadata instead.'
  );
  metaData.addProvider(metaDataProvider);
}
