import type * as cornerstoneImport from '@cornerstonejs/core';
import { loadImage } from './loadImage';
import { metaDataProvider } from './metaData/index';
import type { Types } from '@cornerstonejs/core';

export default function (cornerstone: typeof cornerstoneImport): void {
  // register dicomweb and wadouri image loader prefixes
  cornerstone.registerImageLoader(
    'dicomweb',
    loadImage as unknown as Types.ImageLoaderFn
  );
  cornerstone.registerImageLoader(
    'wadouri',
    loadImage as unknown as Types.ImageLoaderFn
  );
  cornerstone.registerImageLoader(
    'dicomfile',
    loadImage as unknown as Types.ImageLoaderFn
  );

  // add wadouri metadata provider
  cornerstone.metaData.addProvider(metaDataProvider);
}
