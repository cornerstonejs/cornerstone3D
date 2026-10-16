import { cache, volumeLoader } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { LabelmapLayer } from '../../../types/LabelmapTypes';
import { forEachLabelmapImageReference } from './labelmapImageIdMapping';

/** The dynamic source volume of each layer, or null for a layer of no 4D source. */
const dynamicSourceVolumeIds = new WeakMap<LabelmapLayer, string | null>();

function getDynamicSourceVolume(
  layer: LabelmapLayer
): Types.IDynamicImageVolume | undefined {
  let volumeId = dynamicSourceVolumeIds.get(layer);
  if (volumeId === undefined) {
    const { volume } =
      cache.getVolumeContainingImageId(layer.referencedImageIds?.[0] ?? '') ??
      {};
    volumeId = volume?.isDynamicVolume() ? volume.volumeId : null;
    dynamicSourceVolumeIds.set(layer, volumeId);
  }
  return volumeId
    ? (cache.getVolume(volumeId) as Types.IDynamicImageVolume)
    : undefined;
}

/**
 * The labelmap images of the current dimension group, in the order of that
 * group, for a stack layer whose labelmap images reference the frames of more
 * than one dimension group of a dynamic volume. Undefined for another layer.
 */
function getCurrentDimensionGroupLabelmap(
  layer: Pick<LabelmapLayer, 'imageIds' | 'referencedImageIds' | 'volumeId'>
): { imageIds: string[]; dimensionGroupNumber: number } | undefined {
  if (layer.volumeId || !layer.imageIds?.length) {
    return;
  }
  const dynamicVolume = getDynamicSourceVolume(layer as LabelmapLayer);
  if (!dynamicVolume) {
    return;
  }

  const labelmapImageIdBySource = new Map<string, string>();
  forEachLabelmapImageReference(layer as LabelmapLayer, (source, imageId) =>
    labelmapImageIdBySource.set(source, imageId)
  );
  const imageIds = dynamicVolume
    .getCurrentDimensionGroupImageIds()
    .map((referencedImageId) => labelmapImageIdBySource.get(referencedImageId))
    .filter(Boolean);
  if (!imageIds.length || imageIds.length === layer.imageIds.length) {
    return;
  }
  return { imageIds, dimensionGroupNumber: dynamicVolume.dimensionGroupNumber };
}

/**
 * True when the labelmap images reference the frames of more than one time
 * point (dimension group) of a dynamic volume: one segmentation of a 4D
 * source, with one labelmap image for each source frame.
 */
function isDimensionGroupLabelmap(
  layer: Pick<LabelmapLayer, 'imageIds' | 'referencedImageIds' | 'volumeId'>
): boolean {
  return !!getCurrentDimensionGroupLabelmap(layer);
}

/**
 * The labelmap volume of the time point that a 4D source shows now (see
 * isDimensionGroupLabelmap). The segmentation keeps one labelmap image for
 * each source frame, matched by the referenced image.
 *
 * The volume is image backed, so an edit through the volume changes the
 * labelmap images of that time point only. Each dimension group has its own
 * volume id, so a viewport mounts the volume of the new time point after the
 * time point changes.
 *
 * @returns undefined for a layer that is not of a 4D source.
 */
function getOrCreateDimensionGroupLabelmapVolume(
  layer: LabelmapLayer
): Types.IImageVolume | undefined {
  const group = getCurrentDimensionGroupLabelmap(layer);
  if (!group) {
    return;
  }
  const volumeId = `${layer.labelmapId}-dimensionGroup-${group.dimensionGroupNumber}`;
  return (
    (cache.getVolume(volumeId) as Types.IImageVolume) ??
    volumeLoader.createAndCacheVolumeFromImagesSync(volumeId, group.imageIds)
  );
}

export { getOrCreateDimensionGroupLabelmapVolume, isDimensionGroupLabelmap };
