import { addProvider } from '../metaData';

let state: Record<string, any> = {}; // Calibrated pixel spacing per imageId
/**
 * Simple metadata provider that stores some sort of meta data for each imageId.
 */
const metadataProvider = {
  /**
   * Adds metadata for an imageId.
   * @param imageId - the imageId for the metadata to store
   * @param payload - the payload
   */
  add: (imageId: string, payload: any): void => {
    const type = payload.type;

    if (!state[imageId]) {
      state[imageId] = {};
    }

    // Use the raw metadata, or create a deep copy of payload.metadata
    state[imageId][type] =
      payload.rawMetadata ?? structuredClone(payload.metadata);
  },

  /**
   * Returns the metadata for an imageId if it exists.
   * @param type - the type of metadata to enquire about
   * @param imageId - the imageId to enquire about
   */
  get: (type: string, imageId: string): any => {
    return state[imageId]?.[type];
  },

  /**
   * Clears all metadata.
   */
  clear: (): void => {
    state = {};
  },
};

addProvider(metadataProvider.get);

export default metadataProvider;
