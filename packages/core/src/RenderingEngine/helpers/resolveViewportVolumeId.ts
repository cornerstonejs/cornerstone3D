import cache from '../../cache/cache';

const STREAMING_VOLUME_LOADER_SCHEME = 'cornerstoneStreamingImageVolume';

export default function resolveViewportVolumeId(volumeId: string): string {
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
