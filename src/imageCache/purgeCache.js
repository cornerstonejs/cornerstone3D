import cache, { clearCacheSize } from './cache';

export default function purgeCache() {
  cache.clear();
  clearCacheSize();
}
