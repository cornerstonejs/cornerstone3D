import cache from '../../cache/cache';

const STREAMING_VOLUME_LOADER_SCHEME = 'cornerstoneStreamingImageVolume';

/**
 * Gives the id under which the cache holds, or will hold, a volume: the id
 * itself when the cache has the volume or its load, or when the id names a
 * loader scheme; otherwise the id with the streaming volume loader scheme
 * (`cornerstoneStreamingImageVolume:<id>`).
 */
export default function toCacheVolumeId(volumeId: string): string {
  const cachedVolume = cache.getVolume(volumeId);

  if (cachedVolume) {
    return volumeId;
  }

  const cachedLoadObject = cache.getVolumeLoadObject(volumeId);

  if (cachedLoadObject) {
    return volumeId;
  }

  if (volumeId.startsWith(`${STREAMING_VOLUME_LOADER_SCHEME}:`)) {
    return volumeId;
  }

  if (volumeId.includes(':')) {
    return volumeId;
  }

  return `${STREAMING_VOLUME_LOADER_SCHEME}:${volumeId}`;
}
