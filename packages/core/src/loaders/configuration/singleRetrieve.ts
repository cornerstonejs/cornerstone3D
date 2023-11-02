import type { RetrieveStage } from '../../types';

/**
 * This simply retrieves the images sequentially as provided.
 */
const singleRetrieveStages: RetrieveStage[] = [
  {
    id: 'single',
    retrieveType: 'single',
  },
];

export default singleRetrieveStages;
