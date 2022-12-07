import * as cornerstoneImport from '@cornerstonejs/core';
import loadImage from './loadImage';
import { metaDataProvider } from './metaData/index';

export default function (cornerstone: typeof cornerstoneImport): void {
  // register wadors scheme and metadata provider
  cornerstone.registerImageLoader('wadors', loadImage);
  cornerstone.metaData.addProvider(metaDataProvider);
}
