import cache, { getCacheSize, getMaxCacheSize, setMaxCacheSize } from './cache';
import makeAndCacheImageVolume from './makeAndCacheImageVolume';
import makeAndCacheDerivedVolume from './makeAndCacheDerivedVolume';
import makeAndCacheLocalImageVolume from './makeAndCacheLocalImageVolume';
import decacheVolume from './decacheVolume';
import purgeCache from './purgeCache';
import loadVolume from './loadVolume';
import cancelLoadVolume from './cancelLoadVolume';

const imageCache = {
  getImageVolume: uid => {
    return cache.get(uid);
  },
  decacheVolume,
  purgeCache,
  makeAndCacheImageVolume,
  makeAndCacheLocalImageVolume,
  makeAndCacheDerivedVolume,
  loadVolume,
  cancelLoadVolume,
  getCacheSize,
  getMaxCacheSize,
  setMaxCacheSize,
};

export default imageCache;
