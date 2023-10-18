import type { IRetrieveConfiguration } from '../types';

/**
 * This simply retrieves the images sequentially as provided.
 */
const sequentialRetrieveConfiguration: IRetrieveConfiguration = {
  stages: [
    {
      id: 'lossySequential',
      decimate: 1,
      offset: 0,
      retrieveTypeId: 'lossy',
    },
    {
      id: 'finalSequential',
      decimate: 1,
      offset: 0,
    },
  ],
};

export default sequentialRetrieveConfiguration;
