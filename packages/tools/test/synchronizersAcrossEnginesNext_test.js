import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  showStack,
  showVolume,
  waitFor,
} from '../../core/test/utils/planarSeriesBothModes';

const { RenderingEngine, utilities } = cornerstone3D;
const { synchronizers, SynchronizerManager } = csTools3d;

const firstRenderingEngineId = utilities.uuidv4();
const secondRenderingEngineId = utilities.uuidv4();
const synchronizerId = 'synchronizersAcrossEnginesNext';

/** The viewport id that both rendering engines use. */
const VIEWPORT_ID = 'axial';

/** Resolves after two animation frames. */
function frames() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  );
}

/** The slab thickness of the presentation of the source of a viewport. */
function slabOf(viewport) {
  return viewport.getDisplaySetPresentation(viewport.getSourceDataId())
    ?.slabThickness;
}

/**
 * Adds the viewport of each rendering engine to a synchronizer, as a source
 * and as a target.
 */
function synchronizeBoth(synchronizer) {
  synchronizer.add({
    renderingEngineId: firstRenderingEngineId,
    viewportId: VIEWPORT_ID,
  });
  synchronizer.add({
    renderingEngineId: secondRenderingEngineId,
    viewportId: VIEWPORT_ID,
  });
}

describe('The synchronizers between two rendering engines whose viewports have the same id, on direct next planar viewports -- ', () => {
  let firstRenderingEngine;
  let secondRenderingEngine;

  beforeEach(function () {
    firstRenderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId: firstRenderingEngineId,
    }).renderingEngine;
    secondRenderingEngine = new RenderingEngine(secondRenderingEngineId);
  });

  afterEach(function () {
    SynchronizerManager.destroySynchronizer(synchronizerId);
    testUtils.cleanupTestEnvironment({
      renderingEngineId: firstRenderingEngineId,
    });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  it('moves the stack of the other rendering engine to the image of the source with the image slice synchronizer', async function () {
    const series = await createSeries({ id: 'sliceSyncAcrossEngines' });
    const first = createNextViewport(firstRenderingEngine, VIEWPORT_ID);
    const second = createNextViewport(secondRenderingEngine, VIEWPORT_ID);

    await showStack(first, series, 2);
    await showStack(second, series, 2);
    synchronizeBoth(synchronizers.createImageSliceSynchronizer(synchronizerId));

    expect(first).not.toBe(second);
    expect(second.getCurrentImageId()).toBe(series.imageIds[2]);

    await first.setImageIdIndex(5);
    await waitFor(() => first.getCurrentImageIdIndex() === 5);
    await waitFor(() => second.getCurrentImageIdIndex() === 5).catch(
      () => undefined
    );

    expect(first.getCurrentImageIdIndex()).toBe(5);
    expect(second.getCurrentImageId()).toBe(series.imageIds[5]);
  });

  it('gives the volume of the other rendering engine the slab of the source with the slab thickness synchronizer', async function () {
    const series = await createSeries({ id: 'slabSyncAcrossEngines' });
    const first = createNextViewport(firstRenderingEngine, VIEWPORT_ID);
    const second = createNextViewport(secondRenderingEngine, VIEWPORT_ID);

    await showVolume(first, series, 3);
    await showVolume(second, series, 3);
    synchronizeBoth(
      synchronizers.createSlabThicknessSynchronizer(synchronizerId)
    );

    expect(slabOf(second)).toBeUndefined();

    first.setDisplaySetPresentation(first.getSourceDataId(), {
      slabThickness: 5,
    });
    await frames();

    expect(slabOf(first)).toBe(5);
    expect(slabOf(second)).toBe(5);
  });
});
