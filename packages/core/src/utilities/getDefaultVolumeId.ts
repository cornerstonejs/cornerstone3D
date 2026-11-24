import cache from '../cache/cache';
import toCacheVolumeId from '../RenderingEngine/helpers/toCacheVolumeId';

/**
 * The volume id of a list of image ids when no volume id is given: the id
 * that `cache.generateVolumeId` makes from the image ids, under which the
 * cache holds the volume or will hold it. That is the id with
 * `cornerstoneStreamingImageVolume:` in front, unless the cache holds the
 * volume under the bare id. The same image ids in any order give the same
 * id.
 *
 * A planar viewport in volume mode, a 3D viewport and the segmentation tools
 * take this id for a display set whose volume id is given neither on the
 * mount nor at its registration, so that they find one volume in the cache
 * for the same image ids.
 *
 * @param imageIds - The image ids of the volume
 * @returns The id of the volume in the cache
 */
export function getDefaultVolumeId(imageIds: string[]): string {
  return toCacheVolumeId(cache.generateVolumeId(imageIds));
}
