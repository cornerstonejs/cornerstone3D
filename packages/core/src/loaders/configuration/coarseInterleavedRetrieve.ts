import type { RetrieveStage, NearbyFrames } from '../../types';
import { RequestType, ImageQualityStatus } from '../../enums';
import interleavedRetrieveStages from './interleavedRetrieve';

/** The decimation of the coarse stages. */
const COARSE_DECIMATE = 64;

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

const coarseNearbyFrames = nearbyFramesOfDecimation(COARSE_DECIMATE);

const coarseStage = (
  id: string,
  offset: number,
  priority: number
): RetrieveStage => ({
  id,
  decimate: COARSE_DECIMATE,
  offset,
  priority,
  requestType: RequestType.Thumbnail,
  retrieveType: 'default',
  nearbyFrames: coarseNearbyFrames,
});

const [initialImages, ...laterStages] = interleavedRetrieveStages;

/**
 * The interleaved configuration, with three coarse stages first, for a volume
 * of many images.
 *
 * 1. `initialImages` retrieves the middle image and fills a window of 64
 *    frames around it, so the viewport opens on data.
 * 2. `coarse64` retrieves every 64th image. Each one fills the 63 frames around
 *    it, so the whole volume holds data once 1/64 of the images have arrived.
 * 3. `coarse64At21` and `coarse64At42` retrieve every 64th image at the offsets
 *    21 and 42. Each one replaces the frames that have no nearer source, so
 *    after the three stages no frame is more than 11 frames from its source.
 * 4. The stages of `interleavedRetrieveStages` follow in their order. Their
 *    replicates also take the quality of their distance, so a nearer replicate
 *    replaces a coarse one.
 *
 * The stock configuration fills only the frames at -1, +1 and +2 of every
 * fourth image. A frame stays empty until its neighbour arrives, and an empty
 * frame of a CT displays as a gray line in a reformat.
 *
 * No image is retrieved twice: a later stage of an image runs only when the
 * earlier stage of that image did not reach full resolution.
 */
const coarseInterleavedRetrieveStages: RetrieveStage[] = [
  {
    ...initialImages,
    positions: [0.5],
    nearbyFrames: coarseNearbyFrames,
  },
  coarseStage('coarse64', 0, 6),
  coarseStage('coarse64At21', 21, 7),
  coarseStage('coarse64At42', 42, 8),
  ...laterStages.map((stage) => ({
    ...stage,
    priority: stage.priority === undefined ? undefined : stage.priority + 3,
    nearbyFrames: stage.nearbyFrames?.map(({ offset }) => ({
      offset,
      imageQualityStatus: replicateQualityOf(offset),
    })),
  })),
];

export default coarseInterleavedRetrieveStages;
