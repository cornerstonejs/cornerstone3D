import { registerImageLoader, type Types } from '@cornerstonejs/core';
import { metaData } from '@cornerstonejs/metadata';
import { loadImage } from './loadImage';

export default function (): void {
  // register dicomweb and wadouri image loader prefixes
  registerImageLoader('dicomweb', loadImage as unknown as Types.ImageLoaderFn);
  registerImageLoader('wadouri', loadImage as unknown as Types.ImageLoaderFn);
  registerImageLoader('dicomfile', loadImage as unknown as Types.ImageLoaderFn);

  // add wadouri metadata provider
  metaData.addProvider(metaData.typedProviderProvider, -1000);
}
