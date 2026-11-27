import type { RetrieveStage, NearbyFrames } from '../../types';
import { RequestType, ImageQualityStatus } from '../../enums';

/** The decimation of every stage, and so the number of stages. */
const DECIMATE = 64;
const OFFSET_BITS = Math.log2(DECIMATE);

/**
 * The quality of a replicate that is `offset` frames from its source.
 *
 * A frame beside the source holds `ADJACENT_REPLICATE`. A farther frame holds
 * `FAR_REPLICATE + 1 / distance`, which lies between the two replicate levels
 * and falls as the distance grows. A nearby fill replaces a frame only with a
 * strictly higher quality, so a frame always holds the nearest source that has
 * arrived, in whatever order the sources arrive.
 */
export function replicateQualityOf(offset: number): ImageQualityStatus {
  const distance = Math.abs(offset);
  return distance <= 1
    ? ImageQualityStatus.ADJACENT_REPLICATE
    : ((ImageQualityStatus.FAR_REPLICATE + 1 / distance) as ImageQualityStatus);
}

/** The nearby frames that cover a whole window of `decimate` frames. */
function nearbyFramesOfDecimation(decimate: number): NearbyFrames[] {
  const frames: NearbyFrames[] = [];
  const first = -Math.floor((decimate - 1) / 2);

  for (let offset = first; offset < first + decimate; offset++) {
    if (offset !== 0) {
      frames.push({ offset, imageQualityStatus: replicateQualityOf(offset) });
    }
  }

  return frames;
}

/** Reverses the low `bits` bits of `value`: 1 -> 32, 2 -> 16, 3 -> 48. */
function reverseBits(value: number, bits: number): number {
  let reversed = 0;

  for (let bit = 0; bit < bits; bit++) {
    reversed = (reversed << 1) | ((value >> bit) & 1);
  }

  return reversed;
}

/**
 * The gap between the retrieved images once stage `index` and all stages of
 * its level are done: 64 after stage 0, 32 after stage 1, 16 after stages 2
 * and 3, and 1 after the last 32 stages.
 */
function gapAfterStage(index: number): number {
  const level = index === 0 ? 0 : Math.floor(Math.log2(index)) + 1;
  return DECIMATE >> level;
}

const decimateStages: RetrieveStage[] = Array.from(
  { length: DECIMATE },
  (_, index) => {
    const offset = reverseBits(index, OFFSET_BITS);
    const gap = gapAfterStage(index);

    return {
      id: `decimate${DECIMATE}At${offset}`,
      decimate: DECIMATE,
      offset,
      priority: 6 + index,
      requestType: RequestType.Thumbnail,
      retrieveType: 'default',
      nearbyFrames: gap > 1 ? nearbyFramesOfDecimation(gap) : undefined,
    };
  }
);

/**
 * A progressive configuration for a volume of many images, in 64 stages.
 *
 * 1. `initialImages` retrieves the middle image and the last image, and fills
 *    a window of 64 frames around each, so the viewport opens on data.
 * 2. Each later stage retrieves every 64th image at one offset. The offsets
 *    follow the bit-reversed order 0, 32, 16, 48, 8, 40, 24, 56, ..., so each
 *    level of stages halves the gap between the retrieved images over the
 *    whole volume, and no part of the volume waits for another part.
 * 3. Each image fills the frames up to half the gap of its level, with the
 *    quality of the distance. After stage 0 every frame holds data, and every
 *    frame holds its nearest retrieved image after each stage.
 *
 * Each image is retrieved once, at full resolution. The middle and the last
 * images are also part of a decimate stage, and that stage skips them when the
 * first retrieve reached full resolution.
 */
const coarseInterleavedRetrieveStages: RetrieveStage[] = [
  {
    id: 'initialImages',
    // The last image closes the tail of a volume whose length is not a
    // multiple of 64, which no stage of offset 0 reaches.
    positions: [0.5, -1],
    retrieveType: 'default',
    requestType: RequestType.Thumbnail,
    priority: 5,
    nearbyFrames: nearbyFramesOfDecimation(DECIMATE),
  },
  ...decimateStages,
  {
    // Goes back to a basic retrieve when a server returns errors for the
    // requests above.
    id: 'errorRetrieve',
  },
];

export default coarseInterleavedRetrieveStages;
