import type { RetrieveStage } from '../../types';

/**
 * This simply retrieves the images sequentially as provided.
 */
const singleRetrieveStages: RetrieveStage[] = [
  {
    id: 'initialImages',
    retrieveType: 'single',
  },
];

export default singleRetrieveStages;
