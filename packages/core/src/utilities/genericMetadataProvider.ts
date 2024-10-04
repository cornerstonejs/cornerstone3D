import { addProvider } from '../metaData';

let state: Record<string, unknown> = {}; // Calibrated pixel spacing per imageId
/**
 * Simple metadata provider that stores some sort of meta data for each imageId.
 */
const metadataProvider = {
  /**
   * Adds a cloned copy of the metadata for an imageId as the given type.
   * Note that this will strip out any functions or other non-cloneables.
   *
   * @param imageId - the imageId for the metadata to store
   * @param payload - the payload
   */
  add: (
    imageId: string,
    payload: { metadata: unknown; type: string }
  ): void => {
    metadataProvider.addRaw(imageId, {
      ...payload,
      metadata: structuredClone(payload.metadata),
    });
  },

  /**
   * Adds a raw metadata instances for an imageId.  This allows preserving
   * class inheritance values and member functions/proxy instances, but runs
   * the risk that the raw object can be modified through side affects.
   */
  addRaw: (imageId: string, payload: { metadata: unknown; type: string }) => {
    const type = payload.type;

    if (!state[imageId]) {
      state[imageId] = {};
    }

    // Use the raw metadata here
    state[imageId][type] = payload.metadata;
  },

  /**
   * Returns the metadata for an imageId if it exists.
   * @param type - the type of metadata to enquire about
   * @param imageId - the imageId to enquire about
   */
  get: (type: string, imageId: string): unknown => {
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
