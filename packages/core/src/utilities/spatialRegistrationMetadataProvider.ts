import { mat4 } from 'gl-matrix';
import { addProvider } from '../metaData';

const state = {};

/**
 * The last registration added for two viewport ids, with or without the
 * rendering engine ids. A lookup by the viewport ids alone reads it, as the
 * one shared key of 5.x.
 */
const lastByViewportIds = {};

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
 * The registration of a store under a key, or the inverse of the one under
 * the reverse key.
 */
function getRegistration(
  registrations: Record<string, mat4>,
  entryId: string,
  entryIdReverse: string
): mat4 {
  if (registrations[entryId]) {
    return registrations[entryId];
  }

  if (registrations[entryIdReverse]) {
    return mat4.invert(mat4.create(), registrations[entryIdReverse]);
  }
}

/**
 * Simple metadataProvider object to store metadata for spatial registration module.
 *
 * A registration is added for two viewport ids, `[viewportId1, viewportId2]`,
 * or for the viewports of two rendering engines,
 * `[viewportId1, viewportId2, renderingEngineId1, renderingEngineId2]`. Asked
 * with the rendering engine ids, the provider gives the registration of those
 * viewports first, then the one added for the viewport ids alone, so two
 * rendering engines whose viewports have the same ids keep their
 * registrations apart. Asked with the viewport ids alone, it gives the last
 * registration added for them, with or without rendering engine ids, as in
 * 5.x.
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
    lastByViewportIds[getEntryId(viewportId1, viewportId2)] = payload;
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

    if (renderingEngineId1 === undefined || renderingEngineId2 === undefined) {
      return getRegistration(
        lastByViewportIds,
        getEntryId(viewportId1, viewportId2),
        getEntryId(viewportId2, viewportId1)
      );
    }

    const registration = getRegistration(
      state,
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

    return getRegistration(
      state,
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
