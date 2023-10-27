import type { IRetrieveConfiguration } from '../../types';

/**
 * This simply retrieves the images sequentially as provided.
 */
const sequentialRetrieveConfiguration: IRetrieveConfiguration = {
  stages: [
    {
      id: 'lossySequential',
      retrieveType: 'singleFast',
    },
    {
      id: 'finalSequential',
      retrieveType: 'singleFinal',
    },
  ],
};

export default sequentialRetrieveConfiguration;
