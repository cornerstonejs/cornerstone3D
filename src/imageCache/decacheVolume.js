import cache, { incrementCacheSize } from './cache';

export default function decacheVolume(uid) {
  const volume = cache.get(uid);

  if (volume) {
    const byteLength = volume.scalarData.byteLength;

    incrementCacheSize(-byteLength);
  }
}
