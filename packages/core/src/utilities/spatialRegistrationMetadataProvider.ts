import { mat4 } from 'gl-matrix';
import { addProvider } from '../metaData';

const state = {};

/**
 * Simple metadataProvider object to store metadata for spatial registration module.
 */
const spatialRegistrationMetadataProvider = {
  /* Adding a new entry to the state object. */
  add: (query: string[], payload: mat4): void => {
    const [viewportId1, viewportId2] = query;
    const entryId = `${viewportId1}_${viewportId2}`;

    if (!state[entryId]) {
      state[entryId] = {};
    }

    state[entryId] = payload;
  },

  get: (type: string, viewportId1: string, viewportId2: string): mat4 => {
    if (type !== 'spatialRegistrationModule') {
      return;
    }

    // check both ways
    const entryId = `${viewportId1}_${viewportId2}`;

    if (state[entryId]) {
      return state[entryId];
    }

    const entryIdReverse = `${viewportId2}_${viewportId1}`;

    if (state[entryIdReverse]) {
      return mat4.invert(mat4.create(), state[entryIdReverse]);
    }
  },
};

addProvider(
  spatialRegistrationMetadataProvider.get.bind(
    spatialRegistrationMetadataProvider
  )
);

export default spatialRegistrationMetadataProvider;
