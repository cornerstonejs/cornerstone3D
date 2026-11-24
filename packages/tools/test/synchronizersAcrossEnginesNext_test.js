import { mat4 } from 'gl-matrix';
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
  return viewport.getDisplaySetAppearance(viewport.getSourceDisplaySetId())
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
    cornerstone3D.displaySetRegistry.clear?.();
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

    first.setDisplaySetAppearance(first.getSourceDisplaySetId(), {
      slabThickness: 5,
    });
    await frames();

    expect(slabOf(first)).toBe(5);
    expect(slabOf(second)).toBe(5);
  });

  it('keeps the options of the image slice synchronizer apart for the viewport of each rendering engine', async function () {
    const series = await createSeries({ id: 'sliceSyncOptionsAcrossEngines' });
    const first = createNextViewport(firstRenderingEngine, VIEWPORT_ID);
    const second = createNextViewport(secondRenderingEngine, VIEWPORT_ID);
    const synchronizer =
      synchronizers.createImageSliceSynchronizer(synchronizerId);

    await showStack(first, series, 2);
    await showStack(second, series, 2);
    synchronizeBoth(synchronizer);
    synchronizer.setOptions(VIEWPORT_ID, {}, firstRenderingEngineId);
    synchronizer.setOptions(
      VIEWPORT_ID,
      { disabled: true },
      secondRenderingEngineId
    );

    expect(
      synchronizer.getOptions(VIEWPORT_ID, firstRenderingEngineId)
    ).toEqual({});
    expect(
      synchronizer.getOptions(VIEWPORT_ID, secondRenderingEngineId)
    ).toEqual({ disabled: true });

    await first.setImageIdIndex(5);
    await waitFor(() => first.getCurrentImageIdIndex() === 5);
    await frames();
    await frames();

    expect(second.getCurrentImageIdIndex()).toBe(2);

    await second.setImageIdIndex(6);
    await waitFor(() => first.getCurrentImageIdIndex() === 6).catch(
      () => undefined
    );

    expect(second.getCurrentImageIdIndex()).toBe(6);
    expect(first.getCurrentImageId()).toBe(series.imageIds[6]);
  });

  it('moves the target of each rendering engine by the spatial registration of its own rendering engine with the image slice synchronizer', async function () {
    const series = await createSeries({ id: 'sliceSyncRegistrations' });
    const sourceId = 'registrationSource';
    const targetId = 'registrationTarget';
    const engines = [
      {
        renderingEngine: firstRenderingEngine,
        renderingEngineId: firstRenderingEngineId,
        shift: 2,
      },
      {
        renderingEngine: secondRenderingEngine,
        renderingEngineId: secondRenderingEngineId,
        shift: 6,
      },
    ];

    for (const engine of engines) {
      engine.source = createNextViewport(engine.renderingEngine, sourceId);
      engine.target = createNextViewport(engine.renderingEngine, targetId);
      await showStack(engine.source, series, 0);
      await showStack(engine.target, series, 0);
      utilities.spatialRegistrationMetadataProvider.add(
        [
          targetId,
          sourceId,
          engine.renderingEngineId,
          engine.renderingEngineId,
        ],
        mat4.fromTranslation(mat4.create(), [0, 0, engine.shift])
      );
      engine.synchronizer = synchronizers.createImageSliceSynchronizer(
        `${synchronizerId}:${engine.renderingEngineId}`
      );
      engine.synchronizer.addSource({
        renderingEngineId: engine.renderingEngineId,
        viewportId: sourceId,
      });
      engine.synchronizer.addTarget({
        renderingEngineId: engine.renderingEngineId,
        viewportId: targetId,
      });
    }

    try {
      for (const engine of engines) {
        await engine.source.setImageIdIndex(1);
        await waitFor(
          () => engine.target.getCurrentImageIdIndex() === 1 + engine.shift / 2
        ).catch(() => undefined);
      }

      expect(engines[0].target.getCurrentImageId()).toBe(series.imageIds[2]);
      expect(engines[1].target.getCurrentImageId()).toBe(series.imageIds[4]);
    } finally {
      engines.forEach(({ renderingEngineId }) =>
        SynchronizerManager.destroySynchronizer(
          `${synchronizerId}:${renderingEngineId}`
        )
      );
    }
  });
});
