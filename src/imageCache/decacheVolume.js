import cache, { incrementCacheSize } from './cache';
import cancelLoadVolume from './cancelLoadVolume';

export default function decacheVolume(uid) {
  const volume = cache.get(uid);

  if (volume) {
    const byteLength = volume.scalarData.byteLength;

    incrementCacheSize(-byteLength);
  }

  cancelLoadVolume(uid);
  cache.delete(uid);
}
