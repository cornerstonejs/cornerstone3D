import cache from './cache';
import makeAndCacheImageVolume from './makeAndCacheImageVolume';
import makeAndCacheDerivedVolume from './makeAndCacheDerivedVolume';

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
};

export default imageCache;
