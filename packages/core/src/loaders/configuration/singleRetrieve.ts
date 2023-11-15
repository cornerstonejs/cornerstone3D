import type { RetrieveStage } from '../../types';

/**
 * This simply retrieves the images sequentially as provided.
 */
const singleRetrieveStages: RetrieveStage[] = [
  {
    id: 'initialImages',
    retrieveType: 'single',
  },
  // Shouldn't be necessary, but if the server returns an error for the above
  // configuration, this will ensure the image is still fetched.
  {
    id: 'errorRetrieve',
  },
];

export default singleRetrieveStages;
