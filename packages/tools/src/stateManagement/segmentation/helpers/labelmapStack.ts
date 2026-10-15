import { cache } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { LabelmapSegmentationData } from '../../../types/LabelmapTypes';

/**
 * The stack id of the source images that a viewport shows now: the dimension
 * group number, as a string, of a dynamic (4D) volume in the viewport. It is
 * undefined for a viewport without a dynamic volume.
 *
 * A 4D volume holds one stack of source images for each time point. A
 * labelmap with the same `stackId` maps to the source images of that stack,
 * and a DICOM SEG writes it as the StackID of its frames.
 */
function getViewportStackId(viewport: Types.IViewport): string | undefined {
  for (const { referencedId } of viewport?.getActors?.() ?? []) {
    const volume = referencedId ? cache.getVolume(referencedId) : undefined;
    if (volume?.isDynamicVolume?.()) {
      return String((volume as Types.IDynamicImageVolume).dimensionGroupNumber);
    }
  }
  return undefined;
}

/**
 * True when the viewport shows the stack of the labelmap, so that the
 * labelmap can show and can be edited there. A labelmap without a `stackId`,
 * or a viewport without a stack id, always matches.
 */
function isLabelmapStackOnViewport(
  viewport: Types.IViewport,
  labelmapData?: Pick<LabelmapSegmentationData, 'stackId'>
): boolean {
  const stackId = labelmapData?.stackId;
  if (stackId === undefined) {
    return true;
  }
  const viewportStackId = getViewportStackId(viewport);
  return viewportStackId === undefined || viewportStackId === stackId;
}

export { getViewportStackId, isLabelmapStackOnViewport };
