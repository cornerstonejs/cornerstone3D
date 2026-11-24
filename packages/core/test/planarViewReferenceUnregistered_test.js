import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
  waitFor,
  worldOfVoxel,
} from './utils/planarSeriesBothModes';

const { Enums, utilities, volumeLoader, cache } = cornerstone3D;
const { OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/** Resolves after a few animation frames. */
async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Waits until what the viewport was asked for is drawn. */
async function settle(viewport) {
  await frames();
  await renderAndWait(viewport);
}

/** The index of the image that a viewport shows, in the images of a series. */
function shownIndex(viewport, series) {
  return series.imageIds.indexOf(viewport.getCurrentImageId());
}

/**
 * A view reference names the display set of its viewport, and its volume in
 * volume mode. The application may release that display set, or the volume
 * may leave the cache, while the reference lives on in an annotation: OHIF
 * removes the registration of a data id at the last viewport that shows it
 * (its M51). The legacy stack and volume viewports, which had no display set
 * ids, took such a reference by its image, and the volume by its plane.
 */
describe('A view reference of data that is no longer registered on direct next planar viewports -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    cornerstone3D.displaySetRegistry.clear();
  });

  it('a stack takes the reference of its images under a display set that is not registered, or of a volume that is not in the cache, and goes to its image', async function () {
    const series = await createSeries({ id: 'unregisteredStack' });
    const stack = createNextViewport(renderingEngine, 'unregisteredStack');

    await showStack(stack, series, 2);

    const reference = stack.getViewReference();

    stack.setViewState({ slice: { kind: 'stackIndex', imageIdIndex: 5 } });
    await waitFor(() => shownIndex(stack, series) === 5);
    await settle(stack);

    const references = {
      'as it is': reference,
      'without a display set id': { ...reference, displaySetId: undefined },
      'with a display set id that is not registered': {
        ...reference,
        displaySetId: 'unregisteredStack-released',
      },
      'without a display set id, with a volume id that is not in the cache': {
        ...reference,
        displaySetId: undefined,
        volumeId: 'unregisteredStack-volume-not-in-cache',
      },
    };

    for (const [name, viewRef] of Object.entries(references)) {
      expect(stack.isReferenceViewable(viewRef)).withContext(name).toBe(false);
      expect(stack.isReferenceViewable(viewRef, { withNavigation: true }))
        .withContext(name)
        .toBe(true);
    }

    stack.setViewReference(
      references['with a display set id that is not registered']
    );
    await waitFor(() => shownIndex(stack, series) === 2);
    await settle(stack);

    expect(shownIndex(stack, series)).toBe(2);
    expect(
      stack.isReferenceViewable(
        references['with a display set id that is not registered']
      )
    ).toBe(true);
  });

  for (const orientation of [
    OrientationAxis.ACQUISITION,
    OrientationAxis.AXIAL,
  ]) {
    it(`a volume in ${orientation} takes the reference of a stack of its images whose display set is gone, and goes to its image`, async function () {
      const series = await createSeries({
        id: `unregisteredGone-${orientation}`,
      });
      const stack = createNextViewport(
        renderingEngine,
        'unregisteredGoneStack'
      );
      const volume = createNextViewport(
        renderingEngine,
        'unregisteredGoneVolume'
      );

      await showStack(stack, series, 6);
      await showVolume(volume, series, 1, { orientation });

      const reference = stack.getViewReference();

      renderingEngine.disableElement(stack.id);
      cornerstone3D.displaySetRegistry.remove(reference.displaySetId);

      expect(cornerstone3D.displaySetRegistry.has(reference.displaySetId)).toBe(
        false
      );
      expect(volume.isReferenceViewable(reference)).toBe(false);
      expect(
        volume.isReferenceViewable(reference, { withNavigation: true })
      ).toBe(true);

      volume.setViewReference(reference);
      await settle(volume);

      expect(shownIndex(volume, series)).toBe(6);
      expect(volume.isReferenceViewable(reference)).toBe(true);
    });
  }

  it('a sagittal volume takes the reference of a sagittal volume of its images whose display set and volume are gone, by its plane', async function () {
    const series = await createSeries({ id: 'unregisteredPlane' });
    const goneVolumeId = 'unregisteredPlane-gone-volume';
    const goneDisplaySetId = 'unregisteredPlane-gone';
    const gone = createNextViewport(renderingEngine, 'unregisteredPlaneGone');
    const volume = createNextViewport(renderingEngine, 'unregisteredPlaneKept');
    const sagittal = { orientation: OrientationAxis.SAGITTAL };

    volumeLoader.createAndCacheVolumeFromImagesSync(
      goneVolumeId,
      series.imageIds
    );
    cornerstone3D.displaySetRegistry.add(goneDisplaySetId, {
      imageIds: series.imageIds,
      volumeId: goneVolumeId,
    });
    await gone.setDisplaySets({
      displaySetId: goneDisplaySetId,
      options: sagittal,
    });
    await settle(gone);
    gone.setViewState({
      slice: {
        kind: 'volumePoint',
        sliceWorldPoint: worldOfVoxel(series, [21, 12, 4]),
      },
    });
    await settle(gone);
    await showVolume(volume, series, 0, sagittal);
    volume.setViewState({
      slice: {
        kind: 'volumePoint',
        sliceWorldPoint: worldOfVoxel(series, [9, 12, 4]),
      },
    });
    await settle(volume);

    const reference = gone.getViewReference();

    expect(reference.displaySetId).toBe(goneDisplaySetId);
    expect(reference.volumeId).toBe(goneVolumeId);
    expect(reference.referencedImageId).toBeUndefined();

    renderingEngine.disableElement(gone.id);
    cornerstone3D.displaySetRegistry.remove(goneDisplaySetId);
    cache.removeVolumeLoadObject(goneVolumeId);

    expect(cache.getVolume(goneVolumeId)).toBeUndefined();
    expect(volume.isReferenceViewable(reference)).toBe(false);
    expect(
      volume.isReferenceViewable(reference, { withNavigation: true })
    ).toBe(true);

    volume.setViewReference(reference);
    await settle(volume);

    const focalPoint = volume.getResolvedView().toICamera().focalPoint;

    expect(focalPoint[0]).toBeCloseTo(reference.cameraFocalPoint[0], 3);
    expect(volume.isReferenceViewable(reference)).toBe(true);
  });
});
