import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
} from '../../core/test/utils/planarSeriesBothModes';

const { utilities } = cornerstone3D;
const { synchronizers, SynchronizerManager } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const synchronizerId = 'slabThicknessSyncNext';

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

/** Makes the slab thickness synchronizer with one source and one target. */
function synchronize(source, target) {
  const synchronizer =
    synchronizers.createSlabThicknessSynchronizer(synchronizerId);

  synchronizer.addSource({ renderingEngineId, viewportId: source.id });
  synchronizer.addTarget({ renderingEngineId, viewportId: target.id });
}

describe('The slab thickness synchronizer on direct next planar viewports -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    SynchronizerManager.destroySynchronizer(synchronizerId);
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  it('keeps the slab of a volume target when a stack source pans, as the legacy synchronizer took no slab from a stack', async function () {
    const series = await createSeries({ id: 'slabSyncStackSource' });
    const stack = createNextViewport(renderingEngine, 'slabSyncStack');
    const volume = createNextViewport(renderingEngine, 'slabSyncVolume');

    await showStack(stack, series, 3);
    await showVolume(volume, series, 3);
    volume.setDisplaySetPresentation(volume.getSourceDataId(), {
      slabThickness: 5,
    });
    synchronize(stack, volume);

    stack.setPan([10, 5]);
    await renderAndWait(stack);
    await frames();

    expect(stack.getCurrentMode()).toBe('stack');
    expect(stack.getPan()[0]).toBeCloseTo(10, 3);
    expect(stack.getPan()[1]).toBeCloseTo(5, 3);
    expect(slabOf(volume)).toBe(5);
  });

  it('gives a target the slab of a volume source, and clears it when the source clears its own', async function () {
    const series = await createSeries({ id: 'slabSyncVolumeSource' });
    const source = createNextViewport(renderingEngine, 'slabSyncSource');
    const target = createNextViewport(renderingEngine, 'slabSyncTarget');

    await showVolume(source, series, 3);
    await showVolume(target, series, 3);
    synchronize(source, target);

    source.setDisplaySetPresentation(source.getSourceDataId(), {
      slabThickness: 5,
    });
    await frames();

    expect(slabOf(target)).toBe(5);

    source.setDisplaySetPresentation(source.getSourceDataId(), {
      slabThickness: undefined,
    });
    await frames();

    expect(slabOf(source)).toBeUndefined();
    expect(slabOf(target)).toBeUndefined();
  });
});
