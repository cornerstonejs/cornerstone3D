import * as cornerstone3D from '../src/index';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';
import { describe, it, expect, afterEach } from '@jest/globals';
import PlanarViewport from '../src/RenderingEngine/Viewports/Planar/PlanarViewport';
import { displaySetRegistry } from '@cornerstonejs/metadata';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import { MPR_CAMERA_VALUES } from '../src/constants';

const {
  utilities,
  setRenderBackend,
  Enums,
  init,
  cache,
  volumeLoader,
  metaData,
  imageLoader,
} = cornerstone3D;
const { OrientationAxis } = Enums;

const TILT = (15 * Math.PI) / 180;

function setSize(element, width, height) {
  Object.defineProperty(element, 'offsetWidth', { value: width });
  Object.defineProperty(element, 'offsetHeight', { value: height });
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ width, height }),
  });
}

/**
 * Makes a direct next planar viewport on a stand-in rendering engine with CPU
 * rendering. A real rendering engine needs WebGL for a planar viewport, which
 * jsdom lacks; the CPU render paths draw without it.
 */
function createViewport(defaultOptions = {}) {
  window.devicePixelRatio = 1;
  init({});
  setRenderBackend('cpu');
  document.body.innerHTML = '<div id="element"></div>';

  const element = document.getElementById('element');

  setSize(element, 64, 64);

  const renderer = {
    getActiveCamera: () => ({ setParallelProjection() {} }),
    computeVisiblePropBounds: () => [1, -1, 1, -1, 1, -1],
    getViewProps: () => [],
  };
  let viewport;
  const renderingEngine = {
    id: utilities.uuidv4(),
    getRenderer: () => renderer,
    getViewports: () => (viewport ? [viewport] : []),
    renderViewport() {},
    destroy() {
      viewport.destroy();
      renderingEngineCache.delete(renderingEngine.id);
    },
  };

  renderingEngineCache.set(renderingEngine);
  viewport = new PlanarViewport({
    id: 'orientation',
    element,
    renderingEngineId: renderingEngine.id,
    canvas: document.createElement('canvas'),
    sWidth: 64,
    sHeight: 64,
    defaultOptions,
  });

  return { renderingEngine, viewport };
}

/**
 * A local volume of 16 by 12 by 10 voxels whose rows follow x and whose
 * columns are tilted by `tilt` radians about x, as a gantry-tilted CT.
 */
function createVolume(volumeId, tilt) {
  const dimensions = [16, 12, 10];
  const column = [0, Math.cos(tilt), Math.sin(tilt)];
  const scanAxis = [0, -Math.sin(tilt), Math.cos(tilt)];

  return volumeLoader.createLocalVolume(volumeId, {
    dimensions,
    spacing: [1, 1, 2],
    origin: [0, 0, 0],
    direction: [1, 0, 0, ...column, ...scanAxis],
    metadata: { Modality: 'CT', FrameOfReferenceUID: 'tilt-frame' },
    scalarData: new Float32Array(16 * 12 * 10).map((_, index) => index),
  });
}

/**
 * Gives the image plane module of each image of the volume, as a DICOM
 * series of the volume would give it.
 */
function addImagePlaneProvider(volume) {
  const { direction, spacing, origin, dimensions, imageIds } = volume;
  const scanAxis = direction.slice(6, 9);

  metaData.addProvider((type, imageId) => {
    const sliceIndex = imageIds.indexOf(imageId);

    if (type !== 'imagePlaneModule' || sliceIndex < 0) {
      return;
    }

    return {
      imageOrientationPatient: direction.slice(0, 6),
      rowCosines: direction.slice(0, 3),
      columnCosines: direction.slice(3, 6),
      imagePositionPatient: origin.map(
        (value, axis) => value + scanAxis[axis] * spacing[2] * sliceIndex
      ),
      rowPixelSpacing: spacing[1],
      columnPixelSpacing: spacing[0],
      rows: dimensions[1],
      columns: dimensions[0],
      frameOfReferenceUID: 'tilt-frame',
    };
  }, 20000);
}

/** Shows the volume on the viewport through a display set. */
async function showVolume(viewport, volume, options = {}) {
  const displaySetId = `orientation:${volume.volumeId}`;

  addImagePlaneProvider(volume);
  displaySetRegistry.add(displaySetId, {
    imageIds: volume.imageIds,
    volumeId: volume.volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { mode: 'volume', ...options },
  });

  return displaySetId;
}

function expectSameDirection(actual, expected, precision = 6) {
  expected.forEach((value, index) => {
    expect(actual[index]).toBeCloseTo(value, precision);
  });
}

describe('orientation of a volume on a direct next planar viewport', () => {
  let renderingEngine;

  afterEach(() => {
    renderingEngine?.destroy();
    renderingEngine = undefined;
    setRenderBackend('auto');
    cache.purgeCache();
    metaData.removeAllProviders();
  });

  it('shows the true axial plane of a tilted volume for the AXIAL option, as the legacy volume viewport', async () => {
    let viewport;

    ({ renderingEngine, viewport } = createViewport({
      orientation: OrientationAxis.AXIAL,
    }));
    await showVolume(viewport, createVolume('tilted-option', TILT));

    const camera = viewport.getCameraForEvent();

    expectSameDirection(
      camera.viewPlaneNormal,
      MPR_CAMERA_VALUES.axial.viewPlaneNormal
    );
    expectSameDirection(camera.viewUp, MPR_CAMERA_VALUES.axial.viewUp);
  });

  it('shows the true axial plane of a tilted volume for the AXIAL orientation of setDisplaySets', async () => {
    let viewport;

    ({ renderingEngine, viewport } = createViewport());
    await showVolume(viewport, createVolume('tilted-display-set', TILT), {
      orientation: OrientationAxis.AXIAL,
    });

    expectSameDirection(
      viewport.getCameraForEvent().viewPlaneNormal,
      MPR_CAMERA_VALUES.axial.viewPlaneNormal
    );
  });

  it('shows the tilted acquisition plane for ACQUISITION', async () => {
    let viewport;

    ({ renderingEngine, viewport } = createViewport({
      orientation: OrientationAxis.ACQUISITION,
    }));
    await showVolume(viewport, createVolume('tilted-acquisition', TILT));

    const { viewPlaneNormal } = viewport.getCameraForEvent();
    const scanAxis = [0, -Math.sin(TILT), Math.cos(TILT)];
    const dot = viewPlaneNormal.reduce(
      (sum, value, index) => sum + value * scanAxis[index],
      0
    );

    expect(Math.abs(dot)).toBeCloseTo(1, 6);
  });

  it('keeps the acquisition plane for AXIAL on a volume that is not tilted', async () => {
    let viewport;

    ({ renderingEngine, viewport } = createViewport({
      orientation: OrientationAxis.AXIAL,
    }));
    await showVolume(viewport, createVolume('straight', 0));

    expect(viewport.getViewState().orientation).toBe(
      OrientationAxis.ACQUISITION
    );
    expectSameDirection(
      viewport.getCameraForEvent().viewPlaneNormal,
      MPR_CAMERA_VALUES.axial.viewPlaneNormal
    );
  });
});

describe('reformat names in the options of a direct next planar viewport', () => {
  let renderingEngine;

  afterEach(() => {
    renderingEngine?.destroy();
    renderingEngine = undefined;
    setRenderBackend('auto');
    cache.purgeCache();
    metaData.removeAllProviders();
  });

  /**
   * The view vectors that `setOrientation` gives for the name on a viewport
   * that shows the volume in the acquisition plane.
   */
  async function getSetOrientationVectors(name, volumeId) {
    const created = createViewport({
      orientation: OrientationAxis.ACQUISITION,
    });

    await showVolume(created.viewport, createVolume(volumeId, TILT));
    created.viewport.setOrientation(name);

    const { viewPlaneNormal, viewUp } = created.viewport.getCameraForEvent();

    created.renderingEngine.destroy();

    return { viewPlaneNormal, viewUp };
  }

  for (const name of [
    OrientationAxis.AXIAL_REFORMAT,
    OrientationAxis.CORONAL_REFORMAT,
    OrientationAxis.SAGITTAL_REFORMAT,
  ]) {
    it(`gives for ${name} in the options what setOrientation gives`, async () => {
      const expected = await getSetOrientationVectors(name, `set-${name}`);
      let viewport;

      ({ renderingEngine, viewport } = createViewport({ orientation: name }));
      await showVolume(viewport, createVolume(`option-${name}`, TILT));

      const camera = viewport.getCameraForEvent();

      expectSameDirection(camera.viewPlaneNormal, expected.viewPlaneNormal);
      expectSameDirection(camera.viewUp, expected.viewUp);
    });
  }
});

describe('one rule for the orientation of a direct next planar viewport', () => {
  let renderingEngine;

  afterEach(() => {
    renderingEngine?.destroy();
    renderingEngine = undefined;
    setRenderBackend('auto');
    cache.purgeCache();
    metaData.removeAllProviders();
    imageLoader.unregisterAllImageLoaders();
  });

  /** The three ways to give an orientation to a viewport that shows a volume. */
  const ways = {
    'the option of the display set': async (viewport, volume, orientation) => {
      await showVolume(viewport, volume, { orientation });
    },
    setOrientation: async (viewport, volume, orientation) => {
      await showVolume(viewport, volume, {
        orientation: OrientationAxis.ACQUISITION,
      });
      viewport.setOrientation(orientation);
    },
    'setViewState({ orientation })': async (viewport, volume, orientation) => {
      await showVolume(viewport, volume, {
        orientation: OrientationAxis.ACQUISITION,
      });
      viewport.setViewState({ orientation });
    },
  };

  /**
   * Gives a tilted volume the orientation in one of the three ways, on a new
   * viewport, and gives the view vectors and the orientation of the state.
   */
  async function getView(way, orientation, volumeId) {
    const created = createViewport({
      orientation: OrientationAxis.ACQUISITION,
    });

    await ways[way](
      created.viewport,
      createVolume(volumeId, TILT),
      orientation
    );

    const { viewPlaneNormal, viewUp } = created.viewport.getCameraForEvent();
    const state = created.viewport.getViewState().orientation;

    created.renderingEngine.destroy();
    cache.purgeCache();
    metaData.removeAllProviders();

    return { viewPlaneNormal, viewUp, state };
  }

  for (const name of [
    OrientationAxis.AXIAL_REFORMAT,
    OrientationAxis.CORONAL_REFORMAT,
    OrientationAxis.SAGITTAL_REFORMAT,
    OrientationAxis.REFORMAT,
  ]) {
    it(`gives the same view for ${name} in volume mode by the option, by setOrientation and by setViewState`, async () => {
      const views = [];

      for (const way of Object.keys(ways)) {
        views.push(await getView(way, name, `${name}-${views.length}`));
      }

      const [byOption, bySetOrientation, bySetViewState] = views;

      expect(typeof byOption.state).toBe('object');
      expectSameDirection(
        byOption.state.viewPlaneNormal,
        byOption.viewPlaneNormal
      );

      for (const view of [bySetOrientation, bySetViewState]) {
        expect(typeof view.state).toBe('object');
        expectSameDirection(view.viewPlaneNormal, byOption.viewPlaneNormal);
        expectSameDirection(view.viewUp, byOption.viewUp);
      }
    });
  }

  it('takes for REFORMAT the axis closest to the view on display, by setOrientation and by setViewState', async () => {
    const expected = await getView(
      'setOrientation',
      OrientationAxis.SAGITTAL_REFORMAT,
      'closest-expected'
    );

    for (const set of ['setOrientation', 'setViewState']) {
      let viewport;

      ({ renderingEngine, viewport } = createViewport());
      await showVolume(viewport, createVolume(`closest-${set}`, TILT));
      viewport.setOrientation(OrientationAxis.SAGITTAL);

      if (set === 'setOrientation') {
        viewport.setOrientation(OrientationAxis.REFORMAT);
      } else {
        viewport.setViewState({ orientation: OrientationAxis.REFORMAT });
      }

      const camera = viewport.getCameraForEvent();

      expectSameDirection(camera.viewPlaneNormal, expected.viewPlaneNormal);
      expectSameDirection(camera.viewUp, expected.viewUp);
      renderingEngine.destroy();
      renderingEngine = undefined;
      cache.purgeCache();
      metaData.removeAllProviders();
    }
  });

  const SQRT_HALF = Math.sqrt(0.5);
  const vectorInputs = {
    'a normal and a view up': {
      viewPlaneNormal: [SQRT_HALF, SQRT_HALF, 0],
      viewUp: [0, 0, 1],
    },
    'a normal without a view up': { viewPlaneNormal: [0, 0, -1] },
  };

  Object.entries(vectorInputs).forEach(([name, orientation]) => {
    it(`gives the same view for ${name} in volume mode by setOrientation and by setViewState`, async () => {
      const bySetOrientation = await getView(
        'setOrientation',
        orientation,
        'vectors-set-orientation'
      );
      const bySetViewState = await getView(
        'setViewState({ orientation })',
        orientation,
        'vectors-set-view-state'
      );

      expectSameDirection(
        bySetOrientation.viewPlaneNormal,
        orientation.viewPlaneNormal
      );
      expectSameDirection(
        bySetOrientation.viewPlaneNormal,
        bySetViewState.viewPlaneNormal
      );
      expectSameDirection(bySetOrientation.viewUp, bySetViewState.viewUp);
      expect(bySetOrientation.state).toEqual(bySetViewState.state);
    });
  });

  it('takes a view up that is not orthogonal to the normal the same way by setOrientation and by setViewState: both throw', async () => {
    const orientation = { viewPlaneNormal: [0, 0, -1], viewUp: [0, -1, 0.5] };
    let viewport;

    ({ renderingEngine, viewport } = createViewport());
    await showVolume(viewport, createVolume('not-orthogonal', TILT));

    const before = viewport.getViewState().orientation;

    expect(() => viewport.setOrientation(orientation)).toThrow(
      /must be orthogonal/
    );
    expect(() => viewport.setViewState({ orientation })).toThrow(
      /must be orthogonal/
    );
    expect(viewport.getViewState().orientation).toEqual(before);
  });

  /** Shows a stack of four images of the fake image loader on the viewport. */
  async function showStack(viewport) {
    const imageIds = [0, 1, 2, 3].map(
      (sliceIndex) =>
        `fakeImageLoader:${encodeURIComponent(
          JSON.stringify({
            loader: 'fakeImageLoader',
            name: 'orientationStack',
            rows: 16,
            columns: 16,
            barStart: 2,
            barWidth: 4,
            xSpacing: 1,
            ySpacing: 1,
            sliceIndex,
          })
        )}`
    );

    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
    displaySetRegistry.add('orientation:stack', {
      imageIds,
    });
    await viewport.setDisplaySets({
      displaySetId: 'orientation:stack',
      options: { initialImageIdIndex: 1 },
    });

    return imageIds;
  }

  it('leaves the view of a stack as it is for every orientation, without a throw, and says that a stack renders its acquisition only', async () => {
    let viewport;

    ({ renderingEngine, viewport } = createViewport());

    const imageIds = await showStack(viewport);
    const before = viewport.getCameraForEvent();
    const orientations = [
      OrientationAxis.SAGITTAL,
      OrientationAxis.CORONAL,
      OrientationAxis.SAGITTAL_REFORMAT,
      OrientationAxis.REFORMAT,
      { viewPlaneNormal: [1, 0, 0], viewUp: [0, 0, 1] },
    ];

    expect(viewport.getCurrentMode()).toBe('stack');

    for (const orientation of orientations) {
      for (const set of [
        () => viewport.setOrientation(orientation),
        () => viewport.setViewState({ orientation }),
      ]) {
        expect(set).not.toThrow();

        const camera = viewport.getCameraForEvent();

        expect(viewport.getCurrentMode()).toBe('stack');
        expect(viewport.getCurrentImageId()).toBe(imageIds[1]);
        expect(viewport.getViewState().orientation).toBe(
          OrientationAxis.ACQUISITION
        );
        expectSameDirection(camera.viewPlaneNormal, before.viewPlaneNormal);
        expectSameDirection(camera.viewUp, before.viewUp);
      }

      expect(viewport.canRenderOrientation(orientation)).toBe(false);
    }

    expect(viewport.canRenderOrientation(OrientationAxis.ACQUISITION)).toBe(
      true
    );
  });

  it('says for a volume which orientations it can render', async () => {
    let viewport;

    ({ renderingEngine, viewport } = createViewport());
    await showVolume(viewport, createVolume('can-render', TILT));

    for (const orientation of [
      OrientationAxis.ACQUISITION,
      OrientationAxis.SAGITTAL,
      OrientationAxis.CORONAL_REFORMAT,
      OrientationAxis.REFORMAT,
      { viewPlaneNormal: [1, 0, 0], viewUp: [0, 0, 1] },
    ]) {
      expect(viewport.canRenderOrientation(orientation)).toBe(true);
    }
  });
});
