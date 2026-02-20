import { registerImageLoader, type Types } from '@cornerstonejs/core';
import { metaData } from '@cornerstonejs/metadata';
import loadImage from './loadImage';

export default function () {
  // register wadors scheme and metadata provider
  registerImageLoader('wadors', loadImage as unknown as Types.ImageLoaderFn);
  metaData.addProvider(metaData.typedProviderProvider, -1000);
}
