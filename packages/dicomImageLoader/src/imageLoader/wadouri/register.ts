import { metaData, registerImageLoader, type Types } from '@cornerstonejs/core';
import { loadImage } from './loadImage';
import { metaDataProvider } from './metaData/index';

export default function (): void {
  // register dicomweb and wadouri image loader prefixes
  registerImageLoader('dicomweb', loadImage as unknown as Types.ImageLoaderFn);
  registerImageLoader('wadouri', loadImage as unknown as Types.ImageLoaderFn);
  registerImageLoader('dicomfile', loadImage as unknown as Types.ImageLoaderFn);

  // add wadouri metadata provider
  metaData.addProvider(metaDataProvider);
}
