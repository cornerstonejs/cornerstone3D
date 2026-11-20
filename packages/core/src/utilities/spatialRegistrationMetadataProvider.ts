import { mat4 } from 'gl-matrix';
import { addProvider } from '../metaData';
import { getRenderingEngine } from '../RenderingEngine/getRenderingEngine';

const state = {};

/**
 * The last registration added for two viewport ids, with or without the
 * rendering engine ids. A lookup by the viewport ids alone reads it, as the
 * one shared key of 5.x.
 */
const lastByViewportIds = {};

/**
 * A viewport that a registration was calculated for, with the frame of
 * reference that it showed then.
 */
export type CalculatedRegistrationViewport = {
  viewportId: string;
  renderingEngineId: string;
  frameOfReferenceUID?: string;
};

/**
 * The viewports that each calculated registration was worked out for. An
 * application's own registration has no entry.
 */
const calculatedFor = new WeakMap<
  mat4,
  [CalculatedRegistrationViewport, CalculatedRegistrationViewport]
>();

/**
 * Whether a calculated registration no longer holds: one of its viewports
 * shows another frame of reference than when it was calculated. A viewport
 * that is gone, or that gave no frame of reference then, keeps it.
 */
function isStale(registration: mat4 | undefined): boolean {
  return !!calculatedFor
    .get(registration)
    ?.some(({ viewportId, renderingEngineId, frameOfReferenceUID }) => {
      const viewport =
        getRenderingEngine(renderingEngineId)?.getViewport(viewportId);

      return (
        !!viewport &&
        frameOfReferenceUID !== undefined &&
        viewport.getFrameOfReferenceUID?.() !== frameOfReferenceUID
      );
    });
}

/** Removes the registrations of a store under these keys that no longer hold. */
function dropStale(
  registrations: Record<string, mat4>,
  ...entryIds: string[]
): void {
  entryIds.forEach((entryId) => {
    if (isStale(registrations[entryId])) {
      delete registrations[entryId];
    }
  });
}

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
 * the reverse key. A calculated registration that no longer holds
 * (`isStale`) is removed first.
 */
function getRegistration(
  registrations: Record<string, mat4>,
  entryId: string,
  entryIdReverse: string
): mat4 {
  dropStale(registrations, entryId, entryIdReverse);

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
 * 5.x, else the one that was added for the viewport ids alone.
 *
 * A registration added from one viewport to another replaces the one from
 * the second to the first under the same kind of key, so the two directions
 * stay the inverse of each other. A registration that
 * `utilities.calculateViewportsSpatialRegistration` calculated is given only
 * while its viewports show the frames of reference that they showed then; an
 * application's own registration is given as long as it is there.
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
    delete state[
      getEntryId(
        viewportId2,
        viewportId1,
        renderingEngineId2,
        renderingEngineId1
      )
    ];
    delete lastByViewportIds[getEntryId(viewportId2, viewportId1)];
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
      return (
        getRegistration(
          lastByViewportIds,
          getEntryId(viewportId1, viewportId2),
          getEntryId(viewportId2, viewportId1)
        ) ??
        getRegistration(
          state,
          getEntryId(viewportId1, viewportId2),
          getEntryId(viewportId2, viewportId1)
        )
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

/**
 * Adds a registration that was calculated from the images on display of two
 * viewports, for the viewport ids and the rendering engine ids of the two,
 * and keeps the frames of reference that they showed, so the provider stops
 * giving it once one of them shows another frame of reference.
 */
export function addCalculatedRegistration(
  viewports: [CalculatedRegistrationViewport, CalculatedRegistrationViewport],
  payload: mat4
): void {
  const [first, second] = viewports;

  calculatedFor.set(payload, viewports);
  spatialRegistrationMetadataProvider.add(
    [
      first.viewportId,
      second.viewportId,
      first.renderingEngineId,
      second.renderingEngineId,
    ],
    payload
  );
}

addProvider(
  spatialRegistrationMetadataProvider.get.bind(
    spatialRegistrationMetadataProvider
  )
);

export default spatialRegistrationMetadataProvider;
