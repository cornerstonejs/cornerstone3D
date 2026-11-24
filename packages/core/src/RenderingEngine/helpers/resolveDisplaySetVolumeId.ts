import { getDefaultVolumeId } from '../../utilities/getDefaultVolumeId';
import toCacheVolumeId from './toCacheVolumeId';

/**
 * The id of the volume of a display set in volume mode and in a 3D viewport:
 * the volume id of the mount options, else the volume id of the descriptor,
 * else the default id of its image ids (`getDefaultVolumeId`). A given id
 * becomes the id under which the cache holds the volume (`toCacheVolumeId`).
 *
 * @param descriptor - The volume id and the image ids of the display set
 * @param mountVolumeId - The volume id of the mount options
 * @returns The id of the volume in the cache
 */
export default function resolveDisplaySetVolumeId(
  descriptor: { volumeId?: string; imageIds: string[] },
  mountVolumeId?: string
): string {
  const volumeId = mountVolumeId || descriptor.volumeId;

  return volumeId
    ? toCacheVolumeId(volumeId)
    : getDefaultVolumeId(descriptor.imageIds);
}
