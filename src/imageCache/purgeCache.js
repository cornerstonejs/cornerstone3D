import cache from './cache';
import decacheVolume from './decacheVolume';

export default function purgeCache() {
  const iterator = cache.values();

  /* eslint-disable no-constant-condition */
  while (true) {
    const { value: volume, done } = iterator.next();

    if (done) {
      break;
    }

    decacheVolume(volume.uid);
  }
}
