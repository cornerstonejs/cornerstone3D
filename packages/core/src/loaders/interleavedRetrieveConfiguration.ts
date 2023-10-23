import type { IRetrieveConfiguration } from '../types';
import { RequestType, FrameStatus } from '../enums';
import { NearbyFrames } from '../types/IRetrieveConfiguration';

// Defines some nearby frames to replicate to
const nearbyFrames: NearbyFrames[] = [
  { offset: -1, status: FrameStatus.ADJACENT_REPLICATE, linearOffset: -2 },
  { offset: +1, status: FrameStatus.ADJACENT_REPLICATE, linearOffset: 2 },
  { offset: +2, status: FrameStatus.REPLICATE, linearOffset: +4 },
];

/**
 * This configuration is designed to interleave the data requests, using
 * lossy/thumbnail requests when available, but falling back to full retrieve
 * requests in an interleaved manner.
 * The basic ordering is:
 *   1. Retrieve first/last
 *   2. Retrieve every 4th image, offset 1, lossy if available
 *   3. Retrieve every 4th image, offset 3, lossy if available
 *   4. Retrieve every 4th image, offset 0, full images
 *   5. Retrieve every 4th image, offset 2, full images
 *   6. Retrieve every 4th image, offsets 1 and 3, full images if not already done
 */
const interleavedRetrieveConfiguration: IRetrieveConfiguration = {
  stages: [
    // Can choose to do initial lossy images for testing
    // {
    //   id: 'initialImagesLossy',
    //   positions: [0.5, 0, -1],
    //   retrieveTypeId: 'lossy',
    //   requestType: RequestType.Interaction,
    //   priority: 9,
    //   nearbyFrames,
    // },
    {
      id: 'initialImages',
      positions: [0.5, 0, -1],
      retrieveTypeId: 'final',
      requestType: RequestType.Interaction,
      priority: 2,
      nearbyFrames,
    },
    {
      id: 'quarterThumb',
      decimate: 4,
      offset: 1,
      retrieveTypeId: 'lossy',
      requestType: RequestType.Thumbnail,
      priority: 3,
      nearbyFrames,
    },
    {
      id: 'halfThumb',
      decimate: 4,
      offset: 3,
      priority: 4,
      retrieveTypeId: 'lossy',
      requestType: RequestType.Thumbnail,
    },
    {
      id: 'quarterFull',
      decimate: 4,
      offset: 2,
      priority: 5,
      retrieveTypeId: 'final',
    },
    {
      id: 'halfFull',
      decimate: 4,
      offset: 0,
      priority: 6,
      retrieveTypeId: 'final',
    },
    {
      id: 'threeQuarterFull',
      decimate: 4,
      offset: 1,
      priority: 7,
      retrieveTypeId: 'final',
    },
    {
      id: 'finalFull',
      decimate: 4,
      offset: 3,
      priority: 8,
      retrieveTypeId: 'final',
    },
  ],
};

export default interleavedRetrieveConfiguration;
