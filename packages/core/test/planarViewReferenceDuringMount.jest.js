import { describe, it, expect, jest, afterEach } from '@jest/globals';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkCamera from '@kitware/vtk.js/Rendering/Core/Camera';
import { OrientationAxis } from '../src/enums';
import cache from '../src/cache/cache';
import PlanarViewport from '../src/RenderingEngine/Viewports/Planar/PlanarViewport';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import { displaySetRegistry } from '@cornerstonejs/metadata';

const ctId = 'ct-display-set';
const ptId = 'pt-display-set';
const engineId = 'during-mount-engine';

const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

/** A volume with the fields that the decision and the viewport read. */
function createVolume(volumeId, dimensions, spacing) {
  const direction = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const origin = [0, 0, 0];
  const imageData = vtkImageData.newInstance({ spacing, origin, direction });

  imageData.setDimensions(dimensions);

  return {
    volumeId,
    imageIds: Array.from(
      { length: dimensions[2] },
      (_, i) => `${volumeId}:${i}`
    ),
    dimensions,
    spacing,
    direction,
    origin,
    dataType: 'Float32Array',
    voxelGrid: { dimensions, spacing, direction, origin },
    imageData,
    isDynamicVolume: () => false,
    metadata: { FrameOfReferenceUID: 'mount-frame' },
    loadStatus: { loaded: true, loading: false },
    load: jest.fn(),
    getVoxelQuality: jest.fn(() => undefined),
    voxelManager: {
      numberOfComponents: 1,
      getConstructor: () => Float32Array,
      getRange: () => [0, 100],
    },
  };
}

/**
 * A planar viewport whose render paths mount at once, except the mount of a
 * display set named in `held`, which waits until the test lets it go. Gives
 * the viewport and, for each held display set, a promise that resolves when
 * its mount has started and a function that lets it finish.
 */
function createViewport(held = []) {
  const camera = vtkCamera.newInstance();
  let props = [];
  const renderer = {
    getActiveCamera: jest.fn(() => camera),
    addActor: jest.fn(),
    removeActor: jest.fn(),
    getActors: jest.fn(() => []),
    resetCameraClippingRange: jest.fn(),
    computeVisiblePropBounds: () => [1, -1, 1, -1, 1, -1],
    getViewProps: () => props,
    addViewProp: (prop) => {
      if (!props.includes(prop)) {
        props.push(prop);
      }
    },
    removeViewProp: (prop) => {
      props = props.filter((item) => item !== prop);
    },
  };
  const volumeOf = {
    [ctId]: createVolume('ct-volume', [16, 16, 10], [2, 2, 3]),
    [ptId]: createVolume('pt-volume', [8, 8, 5], [4, 4, 6]),
  };
  const holds = new Map(
    held.map((displaySetId) => {
      let started;
      let release;
      const startedPromise = new Promise((resolve) => {
        started = resolve;
      });
      const releasePromise = new Promise((resolve) => {
        release = resolve;
      });

      return [
        displaySetId,
        { started, startedPromise, release, releasePromise },
      ];
    })
  );
  let viewport;

  renderingEngineCache.set({
    id: engineId,
    getRenderer: jest.fn(() => renderer),
    getViewports: jest.fn(() => (viewport ? [viewport] : [])),
    renderViewport: jest.fn(),
  });
  viewport = new PlanarViewport({
    id: 'during-mount-viewport',
    element: document.createElement('div'),
    renderingEngineId: engineId,
    canvas: document.createElement('canvas'),
    sWidth: 200,
    sHeight: 100,
    defaultOptions: {},
  });
  Object.entries(volumeOf).forEach(([id, volume]) => {
    displaySetRegistry.add(id, {
      imageIds: volume.imageIds,
      volumeId: volume.volumeId,
    });
  });
  jest
    .spyOn(cache, 'getVolume')
    .mockImplementation(
      (id) => Object.values(volumeOf).find((v) => v.volumeId === id) ?? null
    );
  jest.spyOn(viewport.dataProvider, 'load').mockImplementation((id, options) =>
    Promise.resolve({
      id,
      type: 'image',
      imageIds: volumeOf[id].imageIds,
      imageVolume: volumeOf[id],
      renderMode: options.renderMode,
      volumeId: volumeOf[id].volumeId,
    })
  );
  viewport.renderPathResolver = {
    resolve: (_type, _data, options) => ({
      createRenderPath: () => ({
        addData: async (_ctx, data) => {
          const hold = holds.get(data.id);

          if (hold) {
            hold.started();
            await hold.releasePromise;
          }

          const actor = { displaySetId: data.id };

          renderer.addViewProp(actor);

          return {
            rendering: {
              renderMode: options.renderMode,
              imageVolume: volumeOf[data.id],
              imageIds: volumeOf[data.id].imageIds,
              currentImageIdIndex: 0,
              maxImageIdIndex: volumeOf[data.id].imageIds.length - 1,
            },
            updateAppearance: jest.fn(),
            applyViewState: jest.fn(),
            getFrameOfReferenceUID: () => 'mount-frame',
            getActorEntry: () => ({ uid: `${data.id}-actor`, actor }),
            removeData: jest.fn(() => renderer.removeViewProp(actor)),
          };
        },
      }),
    }),
  };

  return { viewport, holds };
}

/** The display set id and the role of each layer of the render plan, source first. */
function rolesOf(viewport) {
  return viewport
    .getRenderPlan()
    .map(({ displaySetId, role }) => [displaySetId, role]);
}

describe('A planar viewport given a view reference while a new source mounts', () => {
  let viewport;

  afterEach(() => {
    viewport?.destroy();
    viewport = undefined;
    renderingEngineCache.delete(engineId);
    displaySetRegistry.clear();
    jest.restoreAllMocks();
  });

  it('keeps the new source when a reference of the old source comes between the promotion and the bind', async () => {
    const created = createViewport([ptId]);

    viewport = created.viewport;
    await viewport.setDisplaySets({
      displaySetId: ctId,
      options: { orientation: OrientationAxis.AXIAL },
    });
    await flush();

    const ctReference = viewport.getViewReference();

    expect(ctReference.displaySetId).toBe(ctId);
    expect(rolesOf(viewport)).toEqual([[ctId, 'source']]);

    const mount = viewport.addDisplaySet(ptId, {
      role: 'source',
      orientation: OrientationAxis.AXIAL,
    });
    const hold = created.holds.get(ptId);

    await hold.startedPromise;
    expect(viewport.getSourceDisplaySetId()).toBe(ptId);

    viewport.setViewReference(ctReference);
    hold.release();
    await mount;
    await flush();

    expect(viewport.getSourceDisplaySetId()).toBe(ptId);
    expect(rolesOf(viewport)).toEqual([
      [ptId, 'source'],
      [ctId, 'overlay'],
    ]);
    expect(viewport.getActors().map(({ uid }) => uid)).toEqual([
      `${ptId}-actor`,
      `${ctId}-actor`,
    ]);
  });

  it('keeps the source and its layers for a reference of the overlay after the mount', async () => {
    const created = createViewport();

    viewport = created.viewport;
    await viewport.setDisplaySets(
      {
        displaySetId: ctId,
        options: { orientation: OrientationAxis.AXIAL },
      },
      {
        displaySetId: ptId,
        options: { orientation: OrientationAxis.AXIAL },
      }
    );
    await flush();

    viewport.setViewReference({
      ...viewport.getViewReference(),
      displaySetId: ptId,
      volumeId: 'pt-volume',
    });
    await flush();

    expect(viewport.getSourceDisplaySetId()).toBe(ctId);
    expect(rolesOf(viewport)).toEqual([
      [ctId, 'source'],
      [ptId, 'overlay'],
    ]);
  });
});
