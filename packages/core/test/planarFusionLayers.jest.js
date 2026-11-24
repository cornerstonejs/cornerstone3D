import * as cornerstone3D from '../src/index';
import { describe, it, expect, afterEach } from '@jest/globals';
import { displaySetRegistry } from '@cornerstonejs/metadata';
import { createPlanarViewportOnStandInEngine } from './utils/planarViewportOnStandInEngine';

const { setRenderBackend, Enums, init, cache, volumeLoader } = cornerstone3D;
const { OrientationAxis } = Enums;

/**
 * What the legacy volume viewport, 64 by 64 and axial, showed after
 * `setVolumes` of volume-a (8 by 8 by 10 voxels of 1 mm) and volume-b (8 by
 * 8 by 4 voxels of 1 by 1 by 3 mm), each with its volume id as actor UID, and
 * then `removeVolumeActors(['volume-b'])`: the actor of volume-a only, the
 * image data and the focal point of volume-a. Its `hasVolumeId('volume-b')`
 * still answered true there; a next viewport answers false.
 */
const LEGACY_FUSION_AFTER_REMOVAL = {
  actorReferencedIds: ['volume-a'],
  volumeId: 'volume-a',
  dimensions: [8, 8, 10],
  focalPoint: [3.5, 3.5, 5],
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

/** Turns CPU rendering on and gives a 64 by 64 element for a viewport. */
function setUpCore() {
  window.devicePixelRatio = 1;
  init({});
  setRenderBackend('cpu');
  document.body.innerHTML = '<div id="element"></div>';

  const element = document.getElementById('element');

  setSize(element, 64, 64);

  return element;
}

/**
 * A local volume with the identity direction whose voxel values are their
 * flat index, and a display set of it.
 */
function createVolumeDisplaySet(volumeId, dimensions, spacing) {
  const voxelCount = dimensions[0] * dimensions[1] * dimensions[2];
  const volume = volumeLoader.createLocalVolume(volumeId, {
    dimensions,
    spacing,
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    metadata: { Modality: 'CT', FrameOfReferenceUID: 'volume-frame' },
    scalarData: new Float32Array(voxelCount).map((_, index) => index),
  });
  const displaySetId = `fusion:${volumeId}`;

  displaySetRegistry.add(displaySetId, {
    imageIds: volume.imageIds,
    volumeId,
  });

  return displaySetId;
}

function expectPointClose(actual, expected) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) =>
    expect(value).toBeCloseTo(expected[index], 6)
  );
}

describe('Direct next planar viewport with a fusion', () => {
  let renderingEngine;

  afterEach(() => {
    renderingEngine?.destroy();
    renderingEngine = undefined;
    setRenderBackend('auto');
    cache.purgeCache();
    displaySetRegistry.clear();
  });

  it('keeps the source, its slice and its camera when removeDisplaySet takes the overlay away, as the legacy removeVolumeActors', async () => {
    let viewport;

    ({ renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
      setUpCore(),
      'fusion'
    ));

    const sourceId = createVolumeDisplaySet('volume-a', [8, 8, 10], [1, 1, 1]);
    const overlayId = createVolumeDisplaySet('volume-b', [8, 8, 4], [1, 1, 3]);

    await viewport.setDisplaySets(
      {
        displaySetId: sourceId,
        options: { orientation: OrientationAxis.AXIAL },
      },
      {
        displaySetId: overlayId,
        options: { orientation: OrientationAxis.AXIAL, role: 'overlay' },
      }
    );

    const sliceIndex = viewport.getCurrentImageIdIndex();

    expect(viewport.hasVolumeId('volume-a')).toBe(true);
    expect(viewport.hasVolumeId('volume-b')).toBe(true);
    expect(viewport.getActors().length).toBe(2);

    viewport.removeDisplaySet(overlayId);

    expect(viewport.getActors().map((entry) => entry.referencedId)).toEqual(
      LEGACY_FUSION_AFTER_REMOVAL.actorReferencedIds
    );
    expect(viewport.getVolumeId()).toBe(LEGACY_FUSION_AFTER_REMOVAL.volumeId);
    expect(viewport.getImageData().dimensions).toEqual(
      LEGACY_FUSION_AFTER_REMOVAL.dimensions
    );
    expectPointClose(
      viewport.getCameraForEvent().focalPoint,
      LEGACY_FUSION_AFTER_REMOVAL.focalPoint
    );
    expect(viewport.getSourceDisplaySetId()).toBe(sourceId);
    expect(viewport.getCurrentImageIdIndex()).toBe(sliceIndex);
    expect(viewport.hasVolumeId('volume-a')).toBe(true);
    expect(viewport.hasVolumeId('volume-b')).toBe(false);
  });
});
