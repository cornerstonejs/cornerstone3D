import { addProvider } from '../metaData';

const retrieveConfigurationState = new Map<string, unknown>();

const IMAGE_RETRIEVE_CONFIGURATION = 'imageRetrieveConfiguration';

/**
 * Simple metadataProvider object to store metadata for the image retrieval.
 */
const imageRetrieveMetadataProvider = {
  IMAGE_RETRIEVE_CONFIGURATION,

  /** Empty the metadata state */
  clear: () => {
    retrieveConfigurationState.clear();
  },

  /* Adding a new entry to the state object. */
  add: (key: string, payload): void => {
    retrieveConfigurationState.set(key, payload);
  },

  /** Get a copy of the current configuration state */
  clone: (): Map<string, unknown> => {
    return new Map(retrieveConfigurationState);
  },

  /** Restore the configuration state from a previously cloned state */
  restore: (state: Map<string, unknown>): void => {
    retrieveConfigurationState.clear();
    state.forEach((value, key) => {
      retrieveConfigurationState.set(key, value);
    });
  },

  get: (type: string, ...queries: string[]) => {
    if (type === IMAGE_RETRIEVE_CONFIGURATION) {
      return queries
        .map((query) => retrieveConfigurationState.get(query))
        .find((it) => it !== undefined);
    }
  },
};

addProvider(
  imageRetrieveMetadataProvider.get.bind(imageRetrieveMetadataProvider)
);

export default imageRetrieveMetadataProvider;
