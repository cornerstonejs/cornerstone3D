import { addProvider } from '../metaData';

const retrieveConfigurationState = new Map<string, any>();

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

  get: (type: string, queriesOrQuery: string | string[]) => {
    const queries = Array.isArray(queriesOrQuery)
      ? queriesOrQuery
      : [queriesOrQuery];
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
