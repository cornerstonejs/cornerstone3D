import { addProvider } from '../metaData';

const retrieveOptionsState = new Map<string, any>();
const retrieveConfigurationState = new Map<string, any>();

const IMAGE_RETRIEVE_CONFIGURATION = 'imageRetrieveConfiguration';
const IMAGE_RETRIEVE_OPTIONS = 'imageRetrieveOptions';
/**
 * Simple metadataProvider object to store metadata for the image retrieval.
 */
const imageRetrieveMetadataProvider = {
  IMAGE_RETRIEVE_CONFIGURATION,
  IMAGE_RETRIEVE_OPTIONS,

  /** Empty the metadata state */
  clear: () => {
    retrieveConfigurationState.clear();
    retrieveOptionsState.clear();
  },

  /* Adding a new entry to the state object. */
  addImageRetrieveConfiguration: (uidOrImageId: string, payload): void => {
    retrieveConfigurationState.set(uidOrImageId, payload);
  },

  addImageRetrieveOptions: (uidOrImageId: string, payload): void => {
    retrieveOptionsState.set(uidOrImageId, payload);
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
    if (type === IMAGE_RETRIEVE_OPTIONS) {
      return queries
        .map((query) => retrieveOptionsState.get(query))
        .find((it) => it !== undefined);
    }
  },
};

addProvider(
  imageRetrieveMetadataProvider.get.bind(imageRetrieveMetadataProvider)
);

export default imageRetrieveMetadataProvider;
