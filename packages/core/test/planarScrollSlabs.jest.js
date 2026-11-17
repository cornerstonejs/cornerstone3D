import * as cornerstone3D from '../src/index';
import { describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import PlanarViewport from '../src/RenderingEngine/GenericViewport/Planar/PlanarViewport';
import PlanarViewportLegacyAdapter from '../src/RenderingEngine/GenericViewport/Planar/PlanarViewportLegacyAdapter';
import genericViewportDisplaySetMetadataProvider from '../src/utilities/genericViewportDisplaySetMetadataProvider';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import getSliceRange from '../src/utilities/getSliceRange';
import snapFocalPointToSlice from '../src/utilities/snapFocalPointToSlice';
import getSpacingInNormalDirection from '../src/utilities/getSpacingInNormalDirection';

const { utilities, setUseCPURendering, Enums, init, cache, volumeLoader } =
  cornerstone3D;
const { OrientationAxis } = Enums;

const SLAB = 4;

function setSize(element, width, height) {
  Object.defineProperty(element, 'offsetWidth', { value: width });
  Object.defineProperty(element, 'offsetHeight', { value: height });
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ width, height }),
  });
}

/** Turns CPU rendering on and gives a 64 by 64 element for a viewport. */
function setUpCore() {
  setUseCPURendering(true);
  window.devicePixelRatio = 1;
  init({});
  document.body.innerHTML = '<div id="element"></div>';

  const element = document.getElementById('element');

  setSize(element, 64, 64);

  return element;
}

/**
 * Makes a planar viewport of the class on a stand-in rendering engine. A real
 * rendering engine needs WebGL for a planar viewport, which jsdom lacks; the
 * CPU render paths draw without it.
 */
function createViewport(ViewportClass, element, viewportId) {
  const renderer = { getActiveCamera: () => ({ setParallelProjection() {} }) };
  let viewport;
  const renderingEngine = {
    id: utilities.uuidv4(),
    getRenderer: () => renderer,
    getViewport: () => viewport,
    getViewports: () => (viewport ? [viewport] : []),
    renderViewport() {},
    destroy() {
      viewport.destroy();
      renderingEngineCache.delete(renderingEngine.id);
    },
  };

  renderingEngineCache.set(renderingEngine);
  viewport = new ViewportClass({
    id: viewportId,
    element,
    renderingEngineId: renderingEngine.id,
    canvas: document.createElement('canvas'),
    sWidth: 64,
    sHeight: 64,
    defaultOptions: { orientation: OrientationAxis.AXIAL },
  });

  return { renderingEngine, viewport };
}

/** A local volume of 8 by 8 by 30 voxels of 1 mm with the identity direction. */
function createVolume(volumeId) {
  const dimensions = [8, 8, 30];

  return volumeLoader.createLocalVolume(volumeId, {
    dimensions,
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    metadata: { Modality: 'CT', FrameOfReferenceUID: 'volume-frame' },
    scalarData: new Float32Array(8 * 8 * 30).map((_, index) => index),
  });
}

/** The slice range of the volume along the camera, as the legacy actor gives it. */
function getLegacySliceRange(camera, volume) {
  const mapper = vtkVolumeMapper.newInstance();
  const actor = vtkVolume.newInstance();

  mapper.setInputData(volume.imageData);
  actor.setMapper(mapper);

  return getSliceRange(actor, camera.viewPlaneNormal, camera.focalPoint);
}

/**
 * The focal point after a scroll of a legacy volume viewport with the slab
 * step, as the legacy `scrollVolume` moves it.
 */
function getLegacyScrollFocalPoint(camera, volume, spacing, delta) {
  return snapFocalPointToSlice(
    camera.focalPoint,
    camera.position,
    getLegacySliceRange(camera, volume),
    camera.viewPlaneNormal,
    spacing,
    delta
  ).newFocalPoint;
}

/**
 * The step index and the number of steps of a legacy volume viewport for a
 * step, as `getVolumeViewportScrollInfo` counts them.
 */
function getLegacySteps(camera, volume, spacing) {
  const { min, max, current } = getLegacySliceRange(camera, volume);
  const numScrollSteps = Math.round((max - min) / spacing);

  return {
    currentStepIndex: Math.round(
      ((current - min) / (max - min)) * numScrollSteps
    ),
    numberOfSteps: numScrollSteps + 1,
  };
}

function project(point, normal) {
  return point[0] * normal[0] + point[1] * normal[1] + point[2] * normal[2];
}

describe('scrolling a slab on a planar viewport', () => {
  let renderingEngine;
  let viewport;
  let volume;

  afterEach(() => {
    renderingEngine?.destroy();
    renderingEngine = undefined;
    setUseCPURendering(false);
    cache.purgeCache();
  });

  describe('on a direct next planar viewport', () => {
    const displaySetId = 'scroll-slabs';

    beforeEach(async () => {
      ({ renderingEngine, viewport } = createViewport(
        PlanarViewport,
        setUpCore(),
        'next'
      ));
      volume = createVolume('scroll-volume');
      genericViewportDisplaySetMetadataProvider.add(displaySetId, {
        imageIds: volume.imageIds,
        volumeId: volume.volumeId,
      });
      await viewport.setDisplaySets({
        displaySetId,
        options: { orientation: OrientationAxis.AXIAL },
      });
      viewport.setDisplaySetPresentation(displaySetId, {
        slabThickness: SLAB,
      });
    });

    it('steps by the slab thickness with scrollSlabs of utilities.scroll, as the legacy volume viewport', () => {
      const camera = viewport.getCameraForEvent();
      const expected = getLegacyScrollFocalPoint(camera, volume, SLAB, 1);

      utilities.scroll(viewport, { delta: 1, scrollSlabs: true });

      expect(
        project(viewport.getCameraForEvent().focalPoint, camera.viewPlaneNormal)
      ).toBeCloseTo(project(expected, camera.viewPlaneNormal), 6);
    });

    it('steps by one slice without scrollSlabs', async () => {
      const camera = viewport.getCameraForEvent();

      await viewport.scroll(1);
      utilities.scroll(viewport, { delta: 1 });

      expect(
        Math.abs(
          project(
            viewport.getCameraForEvent().focalPoint,
            camera.viewPlaneNormal
          ) - project(camera.focalPoint, camera.viewPlaneNormal)
        )
      ).toBeCloseTo(2, 6);
    });

    it('steps by one slice in its own scroll, whatever follows the delta', async () => {
      const camera = viewport.getCameraForEvent();

      await viewport.scroll(1, false, false, { scrollSlabs: true });

      expect(
        Math.abs(
          project(
            viewport.getCameraForEvent().focalPoint,
            camera.viewPlaneNormal
          ) - project(camera.focalPoint, camera.viewPlaneNormal)
        )
      ).toBeCloseTo(1, 6);
    });

    it('counts slices of the source in getCurrentImageIdIndex and getNumberOfSlices, not slab steps', () => {
      const before = viewport.getCurrentImageIdIndex();

      expect(viewport.getNumberOfSlices()).toBe(30);
      expect(viewport.getNumberOfSlices(undefined, true)).toBe(30);
      expect(viewport.getCurrentImageIdIndex(undefined, true)).toBe(before);

      utilities.scroll(viewport, { delta: 1 });

      expect(viewport.getCurrentImageIdIndex()).toBe(before + 1);
    });
  });

  describe('on the planar legacy adapter', () => {
    beforeEach(async () => {
      ({ renderingEngine, viewport } = createViewport(
        PlanarViewportLegacyAdapter,
        setUpCore(),
        'adapter'
      ));
      volume = createVolume('scroll-volume');
      await viewport.setVolumes([{ volumeId: volume.volumeId }]);
      viewport.setSlabThickness(SLAB);
    });

    it('steps by the slab thickness on a scroll without options, as the legacy volume viewport', async () => {
      const camera = viewport.getCamera();
      const expected = getLegacyScrollFocalPoint(camera, volume, SLAB, 1);

      await viewport.scroll(1);

      expect(
        project(viewport.getCamera().focalPoint, camera.viewPlaneNormal)
      ).toBeCloseTo(project(expected, camera.viewPlaneNormal), 6);
    });

    it('counts slab steps in getCurrentImageIdIndex, as the legacy volume viewport', () => {
      expect(viewport.getCurrentImageIdIndex()).toBe(
        getLegacySteps(viewport.getCamera(), volume, SLAB).currentStepIndex
      );
    });

    it('counts slab steps in getNumberOfSlices with useSlabThickness, and slices without it', () => {
      expect(viewport.getNumberOfSlices(undefined, true)).toBe(
        getLegacySteps(viewport.getCamera(), volume, SLAB).numberOfSteps
      );
      expect(viewport.getNumberOfSlices()).toBe(30);
    });

    it('steps by the slab thickness with scrollSlabs of utilities.scroll, as the legacy volume viewport', () => {
      const camera = viewport.getCamera();
      const expected = getLegacyScrollFocalPoint(camera, volume, SLAB, 1);

      utilities.scroll(viewport, { delta: 1, scrollSlabs: true });

      expect(
        project(viewport.getCamera().focalPoint, camera.viewPlaneNormal)
      ).toBeCloseTo(project(expected, camera.viewPlaneNormal), 6);
    });
  });
});

describe('the number of slices of the planar legacy adapter', () => {
  let renderingEngine;

  afterEach(() => {
    renderingEngine?.destroy();
    renderingEngine = undefined;
    setUseCPURendering(false);
    cache.purgeCache();
  });

  /**
   * The number of slices of a legacy volume viewport for the camera, as
   * `getImageSliceDataForVolumeViewport` counts them.
   */
  function getLegacyNumberOfSlices(camera, volume) {
    const { min, max } = getLegacySliceRange(camera, volume);

    return (
      Math.round(
        (max - min) /
          getSpacingInNormalDirection(volume, camera.viewPlaneNormal)
      ) + 1
    );
  }

  const views = {
    axial: OrientationAxis.AXIAL,
    sagittal: OrientationAxis.SAGITTAL,
    oblique: {
      viewPlaneNormal: [Math.sqrt(0.5), 0, Math.sqrt(0.5)],
      viewUp: [0, -1, 0],
    },
  };

  Object.entries(views).forEach(([name, orientation]) => {
    it(`gives the number of the legacy volume viewport on an ${name} view`, async () => {
      let viewport;

      ({ renderingEngine, viewport } = createViewport(
        PlanarViewportLegacyAdapter,
        setUpCore(),
        'slices'
      ));

      const dimensions = [8, 6, 20];
      const volume = volumeLoader.createLocalVolume('slices-volume', {
        dimensions,
        spacing: [1, 1, 1],
        origin: [0, 0, 0],
        direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        metadata: { Modality: 'CT', FrameOfReferenceUID: 'volume-frame' },
        scalarData: new Float32Array(8 * 6 * 20),
      });

      await viewport.setVolumes([{ volumeId: volume.volumeId }]);
      viewport.setOrientation(orientation);

      const legacy = getLegacyNumberOfSlices(viewport.getCamera(), volume);

      expect(viewport.getNumberOfSlices()).toBe(legacy);
      expect(PlanarViewport.prototype.getNumberOfSlices.call(viewport)).toBe(
        legacy
      );
    });
  });
});
