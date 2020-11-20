import cache, { incrementCacheSize } from './cache';
import cancelLoadVolume from './cancelLoadVolume';

export default function decacheVolume(uid) {
  const volume = cache.get(uid);

  if (volume) {
    const byteLength = volume.scalarData.byteLength;

    incrementCacheSize(-byteLength);
  }

  cancelLoadVolume(uid);

  // Clear texture memory (it will probably only be released at garbage collection of the dom element, but might as well try)
  volume.volumeMapper.getScalarTexture().releaseGraphicsResources();

  cache.delete(uid);
}
