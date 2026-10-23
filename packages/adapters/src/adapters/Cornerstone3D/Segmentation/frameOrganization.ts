import { Enums } from '@cornerstonejs/core';
import { utilities as metadataUtilities } from '@cornerstonejs/metadata';
import { getSourceFrame } from './sourceFrame';

const { MetadataModules } = Enums;

/**
 * How a LABELMAP SEG organizes its frames:
 * - `volume`: frames in the patient coordinate system of the source, with the
 *   Frame of Reference and the plane macros, indexed by position.
 * - `stack`: one stack in source order, indexed by StackID and
 *   InStackPositionNumber. The SEG has no Frame of Reference and no plane
 *   macros, so a reader places each frame by its source image reference only.
 */
export type FrameOrganization = 'volume' | 'stack';

const firstNumber = (value) => Number(Array.isArray(value) ? value[0] : value);

/**
 * True when the instance is one time point or one phase of a 4D series. Its
 * positions repeat in the other time points, so a position does not identify
 * the source frame.
 */
export function isTemporalInstance(instance): boolean {
  if (!instance) {
    return false;
  }
  const seriesType = [instance.SeriesType ?? []].flat().join('\\');
  return (
    firstNumber(instance.NumberOfTemporalPositions) > 1 ||
    firstNumber(instance.NumberOfTimeSlices) > 1 ||
    firstNumber(instance.NumberOfTimeSlots) > 1 ||
    /^(DYNAMIC|GATED)\b/.test(seriesType)
  );
}

/**
 * The frame organization of a LABELMAP SEG of `images`. It is `stack` when:
 * - the caller sets `isVolumetric: false`, for example for a display set
 *   that is not a volume;
 * - a source image is part of a 4D series (see isTemporalInstance), so that
 *   the segmentation stays on its time point;
 * - a source image has no Frame of Reference, position or orientation.
 *
 * It is `volume` otherwise. `isVolumetric: true` does not force `volume`.
 */
export function getFrameOrganization(
  images: Array<{ imageId?: string }>,
  metadata,
  options: { isVolumetric?: unknown } = {}
): FrameOrganization {
  if (options.isVolumetric === false) {
    return 'stack';
  }
  const isStack = images.some((image) => {
    const instance = metadata?.get?.(
      MetadataModules.IMAGE_DATA,
      image?.imageId
    );
    if (isTemporalInstance(instance)) {
      return true;
    }
    const { position, orientation } = getSourceFrame(image, metadata);
    return !position || !orientation;
  });
  return isStack ? 'stack' : 'volume';
}

/**
 * The StackID of each frame image of a stack LABELMAP SEG: the 1-based time
 * point of its source image, when the source images of the segmentation are a
 * 4D series (a volume at each time point), else `1`. A SEG of a 4D series thus
 * has one stack for each time point that has segment data, and a reader places
 * each frame on its own time point. A time series of one image position, for
 * example an ultrasound cine, is one stack.
 *
 * @param sourceImages - All source images of the segmentation, for example
 *   all time points of a 4D series; splitImageIdsBy4DTags splits them.
 * @param frameImages - The source image of each SEG frame.
 */
export function getFrameStackIds(
  sourceImages: Array<{ imageId?: string }>,
  frameImages: Array<{ imageId?: string }>
): string[] {
  const { imageIdGroups: timePoints } = metadataUtilities.splitImageIdsBy4DTags(
    sourceImages.map(({ imageId }) => imageId)
  );
  const timePointByImageId = new Map<string, number>();
  if (
    timePoints.length > 1 &&
    timePoints.every((imageIds) => imageIds.length > 1)
  ) {
    timePoints.forEach((imageIds, index) =>
      imageIds.forEach((imageId) => timePointByImageId.set(imageId, index + 1))
    );
  }
  return frameImages.map(({ imageId }) =>
    String(timePointByImageId.get(imageId) ?? 1)
  );
}
