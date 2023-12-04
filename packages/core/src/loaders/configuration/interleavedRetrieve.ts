import { RetrieveStage, NearbyFrames } from '../../types';
import { RequestType, ImageQualityStatus } from '../../enums';

// Defines some nearby frames to replicate to
const nearbyFrames: NearbyFrames[] = [
  {
    offset: -1,
    imageQualityStatus: ImageQualityStatus.ADJACENT_REPLICATE,
  },
  {
    offset: +1,
    imageQualityStatus: ImageQualityStatus.ADJACENT_REPLICATE,
  },
  { offset: +2, imageQualityStatus: ImageQualityStatus.FAR_REPLICATE },
];

/**
 * This configuration is designed to interleave the data requests, using
 * lossy/thumbnail requests when available, but falling back to full retrieve
 * requests in an interleaved manner.
 * The basic ordering is:
 *   1. Retrieve middle image, first, last
 *   2. Retrieve every 4th image, offset 1, lossy if available
 *   3. Retrieve every 4th image, offset 3, lossy if available
 *   4. Retrieve every 4th image, offset 0, full images
 *   5. Retrieve every 4th image, offset 2, full images
 *   6. Retrieve every 4th image, offsets 1 and 3, full images if not already done
 */
const interleavedRetrieveConfiguration: RetrieveStage[] = [
  {
    id: 'initialImages',
    // Values between -1 and 1 are relative to size, so 0.5 is middle image
    // and 0 is first image, -1 is last image
    positions: [0.5, 0, -1],
    retrieveType: 'default',
    requestType: RequestType.Thumbnail,
    priority: 5,
    nearbyFrames,
  },
  {
    id: 'quarterThumb',
    decimate: 4,
    offset: 3,
    requestType: RequestType.Thumbnail,
    retrieveType: 'multipleFast',
    priority: 6,
    nearbyFrames,
  },
  {
    id: 'halfThumb',
    decimate: 4,
    offset: 1,
    priority: 7,
    requestType: RequestType.Thumbnail,
    retrieveType: 'multipleFast',
    nearbyFrames,
  },
  {
    id: 'quarterFull',
    decimate: 4,
    offset: 2,
    priority: 8,
    requestType: RequestType.Thumbnail,
    retrieveType: 'multipleFinal',
  },
  {
    id: 'halfFull',
    decimate: 4,
    offset: 0,
    priority: 9,
    requestType: RequestType.Thumbnail,
    retrieveType: 'multipleFinal',
  },
  {
    id: 'threeQuarterFull',
    decimate: 4,
    offset: 1,
    priority: 10,
    requestType: RequestType.Thumbnail,
    retrieveType: 'multipleFinal',
  },
  {
    id: 'finalFull',
    decimate: 4,
    offset: 3,
    priority: 11,
    requestType: RequestType.Thumbnail,
    retrieveType: 'multipleFinal',
  },
  {
    // This goes back to basic retrieve to recover from retrieving against
    // servers returning errors for any of the above requests.
    id: 'errorRetrieve',
  },
];
export default interleavedRetrieveConfiguration;
