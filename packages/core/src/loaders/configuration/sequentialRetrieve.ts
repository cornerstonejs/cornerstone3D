import type { RetrieveStage } from '../../types/index.js';

/**
 * This simply retrieves the images sequentially as provided.
 */
const sequentialRetrieveStages: RetrieveStage[] = [
  {
    id: 'lossySequential',
    retrieveType: 'singleFast',
  },
  {
    id: 'finalSequential',
    retrieveType: 'singleFinal',
  },
];

export default sequentialRetrieveStages;
