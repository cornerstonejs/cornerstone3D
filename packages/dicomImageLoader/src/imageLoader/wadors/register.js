import loadImage from './loadImage';
import { metaDataProvider } from './metaData/index.js';

export default function (cornerstone) {
  // register wadors scheme and metadata provider
  cornerstone.registerImageLoader('wadors', loadImage);
  cornerstone.metaData.addProvider(metaDataProvider);
}
