import cache from './cache';
import makeAndCacheImageVolume from './makeAndCacheImageVolume';
import makeAndCacheDerivedVolume from './makeAndCacheDerivedVolume';
import loadVolume from './loadVolume';

// TODO -> Make classes for imageVolume and derived volumes.
// Image volumes have stuff like load states and imageIds, wherease dervied don't.
// Also need to consider non-derived volumes that you just create here, but I guess those
// would be the same typed as "derived".
// "StreamingVolume" and "Volume"?

const imageCache = {
  getImageVolume: uid => {
    return cache.get(uid);
  },
  decacheVolume: uid => {
    cache.delete(uid);
  },
  purgeCache: () => {
    cache.clear();
  },
  makeAndCacheImageVolume,
  makeAndCacheDerivedVolume,
  loadVolume,
};

export default imageCache;
