import { metaData } from '..';

const state: Record<string, any> = {}; // Calibrated pixel spacing per imageId
/**
 * Simple metadata provider that stored the derived metadata in memory.
 */
const metadataProvider = {
  /**
   * Adds metadata for an imageId.
   * @param imageId - the imageId for the metadata to store
   * @param payload - the payload composed of new calibrated pixel spacings
   */
  add: (imageId: string, payload: any): void => {
    const type = payload.type;

    if (!state[imageId]) {
      state[imageId] = {};
    }

    // Create a deep copy of payload.metadata
    state[imageId][type] = JSON.parse(JSON.stringify(payload.metadata));
  },

  /**
   * Returns the metadata for an imageId if it exists.
   * @param type - the type of metadata to enquire about
   * @param imageId - the imageId to enquire about
   */
  get: (type: string, imageId: string): any => {
    return state[imageId]?.[type];
  },
};

metaData.addProvider(metadataProvider.get);

export default metadataProvider;
