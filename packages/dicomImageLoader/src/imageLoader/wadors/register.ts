import { loadImage } from '../wadouri/loadImage';
import { metaDataProvider } from '../wadouri/metaData/index';

/**
 * Register wadors scheme and metadata provider.
 * NOTE: currently, wadouri loadImage and metadataProvider are used also for wadors
 * (see imports). For more information see:
 */
export default function (cornerstone) {
  cornerstone.registerImageLoader('wadors', loadImage);
  cornerstone.metaData.addProvider(metaDataProvider);
}
