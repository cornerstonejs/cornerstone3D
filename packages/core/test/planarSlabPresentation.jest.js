import * as cornerstone3D from '../src/index';
import { describe, it, expect, afterEach } from '@jest/globals';
import { displaySetRegistry } from '@cornerstonejs/metadata';
import { createPlanarViewportOnStandInEngine } from './utils/planarViewportOnStandInEngine';

const { Enums, init, cache, volumeLoader, utilities } = cornerstone3D;
const { BlendModes, OrientationAxis } = Enums;

/**
 * The display resolution of `getFidelityState()` on the legacy volume
 * viewport (`58914567b`, 400 by 300, GPU) for a local volume of 32 by 32 by
 * 20 voxels of 1 by 1 by 2 mm, after `setBlendMode` and `setSlabThickness`.
 * An average slab thicker than the slice spacing set the spacing along the
 * view plane normal; a MIP slab or a thinner average slab did not.
 */
const LEGACY_DISPLAY_SPACING = {
  [OrientationAxis.AXIAL]: {
    none: [1, 1, 2],
    'average 5': [1, 1, 5],
    'mip 5': [1, 1, 2],
    'average 0.5': [1, 1, 2],
  },
  [OrientationAxis.SAGITTAL]: {
    none: [1, 1, 2],
    'average 5': [5, 1, 2],
    'mip 5': [1, 1, 2],
    'average 0.5': [1, 1, 2],
  },
};

const SLABS = {
  none: undefined,
  'average 5': {
    blendMode: BlendModes.AVERAGE_INTENSITY_BLEND,
    slabThickness: 5,
  },
  'mip 5': { blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND, slabThickness: 5 },
  'average 0.5': {
    blendMode: BlendModes.AVERAGE_INTENSITY_BLEND,
    slabThickness: 0.5,
  },
};

function setSize(element, width, height) {
  Object.defineProperty(element, 'offsetWidth', { value: width });
  Object.defineProperty(element, 'offsetHeight', { value: height });
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ width, height }),
  });
}

/** Gives a 64 by 64 element for a viewport. */
function setUpCore() {
  window.devicePixelRatio = 1;
  init({});
  document.body.innerHTML = '<div id="element"></div>';

  const element = document.getElementById('element');

  setSize(element, 64, 64);

  return element;
}

/** A local volume of 32 by 32 by 20 voxels of 1 by 1 by 2 mm, and its display set. */
function createVolumeDisplaySet(volumeId) {
  const dimensions = [32, 32, 20];
  const voxelCount = dimensions[0] * dimensions[1] * dimensions[2];
  const volume = volumeLoader.createLocalVolume(volumeId, {
    dimensions,
    spacing: [1, 1, 2],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    metadata: { Modality: 'CT', FrameOfReferenceUID: 'volume-frame' },
    scalarData: new Float32Array(voxelCount).map((_, index) => index % 200),
  });
  const displaySetId = `slab:${volumeId}`;

  displaySetRegistry.add(displaySetId, {
    imageIds: volume.imageIds,
    volumeId,
  });

  return displaySetId;
}

describe('Direct next planar viewport and the fidelity of a slab', () => {
  let renderingEngine;

  afterEach(() => {
    renderingEngine?.destroy();
    renderingEngine = undefined;
    cache.purgeCache();
    displaySetRegistry.clear();
  });

  const cases = Object.keys(LEGACY_DISPLAY_SPACING).flatMap((orientation) =>
    Object.keys(SLABS).map((slab) => [orientation, slab])
  );

  it.each(cases)(
    'reports the display resolution of the legacy volume viewport in the %s view with the slab %s',
    async (orientation, slab) => {
      let viewport;

      ({ renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
        setUpCore(),
        'slab-fidelity'
      ));

      const displaySetId = createVolumeDisplaySet(`volume-${orientation}`);

      await viewport.setDisplaySets({
        displaySetId,
        options: { orientation, renderBackend: 'cpu' },
      });

      if (SLABS[slab]) {
        viewport.setDisplaySetAppearance(displaySetId, SLABS[slab]);
      }

      expect(viewport.getFidelityState().displayResolution.spacing).toEqual(
        LEGACY_DISPLAY_SPACING[orientation][slab]
      );
    }
  );
});

/**
 * What `getTargetVolumeAndSpacingInNormalDir(viewport, camera, volumeId,
 * useSlabThickness)` gave on the legacy volume viewport (`58914567b`, axial)
 * for the volume of `createVolumeDisplaySet` after `setBlendMode` and
 * `setSlabThickness`: the slab thickness with `useSlabThickness`, else the
 * spacing along the normal.
 */
const LEGACY_SLAB_STEP = {
  none: { withSlab: 2, without: 2 },
  'average 5': { withSlab: 5, without: 2 },
  'mip 5': { withSlab: 5, without: 2 },
};

describe('Direct next planar viewport and the slab step of getTargetVolumeAndSpacingInNormalDir', () => {
  let renderingEngine;

  afterEach(() => {
    renderingEngine?.destroy();
    renderingEngine = undefined;
    cache.purgeCache();
    displaySetRegistry.clear();
  });

  it.each(Object.keys(LEGACY_SLAB_STEP))(
    'gives the step of the legacy volume viewport with the slab %s in the presentation',
    async (slab) => {
      let viewport;

      ({ renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
        setUpCore(),
        'slab-step'
      ));

      const volumeId = `volume-step-${slab}`;
      const displaySetId = createVolumeDisplaySet(volumeId);

      await viewport.setDisplaySets({
        displaySetId,
        options: { orientation: OrientationAxis.AXIAL, renderBackend: 'cpu' },
      });

      if (SLABS[slab]) {
        viewport.setDisplaySetAppearance(displaySetId, SLABS[slab]);
      }

      const camera = viewport.getResolvedView().toICamera();
      const step = (useSlabThickness) =>
        utilities.getTargetVolumeAndSpacingInNormalDir(
          viewport,
          camera,
          volumeId,
          useSlabThickness
        ).spacingInNormalDirection;

      expect({ withSlab: step(true), without: step(false) }).toEqual(
        LEGACY_SLAB_STEP[slab]
      );
    }
  );

  it.each(Object.keys(LEGACY_SLAB_STEP))(
    'gives the same step without a target id, the volume being chosen by its spacing, with the slab %s',
    async (slab) => {
      let viewport;

      ({ renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
        setUpCore(),
        'slab-step-auto'
      ));

      const volumeId = `volume-step-auto-${slab}`;
      const displaySetId = createVolumeDisplaySet(volumeId);

      await viewport.setDisplaySets({
        displaySetId,
        options: { orientation: OrientationAxis.AXIAL, renderBackend: 'cpu' },
      });

      if (SLABS[slab]) {
        viewport.setDisplaySetAppearance(displaySetId, SLABS[slab]);
      }

      const camera = viewport.getResolvedView().toICamera();
      const target = (useSlabThickness) =>
        utilities.getTargetVolumeAndSpacingInNormalDir(
          viewport,
          camera,
          undefined,
          useSlabThickness
        );

      expect(target(true).imageVolume?.volumeId).toBe(volumeId);
      expect({
        withSlab: target(true).spacingInNormalDirection,
        without: target(false).spacingInNormalDirection,
      }).toEqual(LEGACY_SLAB_STEP[slab]);
    }
  );
});
