import { mat4 } from 'gl-matrix';
import { addProvider } from '../metaData';

const state = {};

/**
 * The key of the registration from one viewport to another: by their
 * viewport ids, or by their rendering engine ids and viewport ids when both
 * rendering engine ids are given.
 */
function getEntryId(
  viewportId1: string,
  viewportId2: string,
  renderingEngineId1?: string,
  renderingEngineId2?: string
): string {
  if (renderingEngineId1 === undefined || renderingEngineId2 === undefined) {
    return `${viewportId1}_${viewportId2}`;
  }

  return JSON.stringify([
    renderingEngineId1,
    viewportId1,
    renderingEngineId2,
    viewportId2,
  ]);
}

/**
 * The registration under a key, or the inverse of the one under the reverse
 * key.
 */
function getRegistration(entryId: string, entryIdReverse: string): mat4 {
  if (state[entryId]) {
    return state[entryId];
  }

  if (state[entryIdReverse]) {
    return mat4.invert(mat4.create(), state[entryIdReverse]);
  }
}

/**
 * Simple metadataProvider object to store metadata for spatial registration module.
 *
 * A registration is added for two viewport ids, `[viewportId1, viewportId2]`,
 * or for the viewports of two rendering engines,
 * `[viewportId1, viewportId2, renderingEngineId1, renderingEngineId2]`. Asked
 * with the rendering engine ids, the provider gives the registration of those
 * viewports first, then the one of the viewport ids alone, so two rendering
 * engines whose viewports have the same ids keep their registrations apart.
 */
const spatialRegistrationMetadataProvider = {
  /* Adding a new entry to the state object. */
  add: (query: string[], payload: mat4): void => {
    const [viewportId1, viewportId2, renderingEngineId1, renderingEngineId2] =
      query;
    const entryId = getEntryId(
      viewportId1,
      viewportId2,
      renderingEngineId1,
      renderingEngineId2
    );

    if (!state[entryId]) {
      state[entryId] = {};
    }

    state[entryId] = payload;
  },

  get: (
    type: string,
    viewportId1: string,
    viewportId2: string,
    renderingEngineId1?: string,
    renderingEngineId2?: string
  ): mat4 => {
    if (type !== 'spatialRegistrationModule') {
      return;
    }

    if (renderingEngineId1 !== undefined && renderingEngineId2 !== undefined) {
      const registration = getRegistration(
        getEntryId(
          viewportId1,
          viewportId2,
          renderingEngineId1,
          renderingEngineId2
        ),
        getEntryId(
          viewportId2,
          viewportId1,
          renderingEngineId2,
          renderingEngineId1
        )
      );

      if (registration) {
        return registration;
      }
    }

    return getRegistration(
      getEntryId(viewportId1, viewportId2),
      getEntryId(viewportId2, viewportId1)
    );
  },
};

addProvider(
  spatialRegistrationMetadataProvider.get.bind(
    spatialRegistrationMetadataProvider
  )
);

export default spatialRegistrationMetadataProvider;
