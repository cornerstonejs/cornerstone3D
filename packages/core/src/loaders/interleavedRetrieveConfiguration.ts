import type { IRetrieveConfiguration } from '../types';
import { RequestType } from '../enums';

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
    {
      id: 'initialImages',
      positions: [0.5, 0, -1],
      retrieveTypeId: 'final',
      requestType: RequestType.Interaction,
      priority: 8,
    },
    // {
    //   id: 'all',
    //   decimate: 1,
    //   offset: 0,
    // },
    {
      id: 'quarterThumb',
      decimate: 4,
      offset: 1,
      retrieveTypeId: 'lossy',
      requestType: RequestType.Thumbnail,
      priority: 7,
    },
    {
      id: 'halfThumb',
      decimate: 4,
      offset: 3,
      priority: 6,
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
      priority: 4,
      retrieveTypeId: 'final',
    },
    {
      id: 'threeQuarterFull',
      decimate: 4,
      offset: 1,
      priority: 3,
      retrieveTypeId: 'final',
    },
    {
      id: 'finalFull',
      decimate: 4,
      offset: 3,
      priority: 2,
      retrieveTypeId: 'final',
    },
  ],
};

export default interleavedRetrieveConfiguration;
