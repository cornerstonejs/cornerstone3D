import * as cornerstone3D from '../src/index';
import { describe, it, expect, afterEach } from '@jest/globals';
import PlanarViewport from '../src/RenderingEngine/GenericViewport/Planar/PlanarViewport';
import genericViewportDisplaySetMetadataProvider from '../src/utilities/genericViewportDisplaySetMetadataProvider';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import { MPR_CAMERA_VALUES } from '../src/constants';

const {
  utilities,
  setUseCPURendering,
  Enums,
  init,
  cache,
  volumeLoader,
  metaData,
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
  setUseCPURendering(true);
  window.devicePixelRatio = 1;
  init({});
  document.body.innerHTML = '<div id="element"></div>';

  const element = document.getElementById('element');

  setSize(element, 64, 64);

  const renderer = { getActiveCamera: () => ({ setParallelProjection() {} }) };
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
  genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds: volume.imageIds,
    volumeId: volume.volumeId,
  });
  await viewport.setDisplaySets({ displaySetId, options });

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
    setUseCPURendering(false);
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
    setUseCPURendering(false);
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
