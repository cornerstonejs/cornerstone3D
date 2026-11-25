import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { utilities, Enums, volumeLoader, cache } = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;
const { synchronizers } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const synchronizerId = 'voiSyncInvertNext';

/** Makes two direct next planar viewports in one rendering engine. */
function createNextViewports(renderingEngine) {
  return ['nextSource', 'nextTarget'].map((viewportId) => {
    testUtils.createViewports(renderingEngine, {
      viewportId,
      viewportType: ViewportType.PLANAR,
      orientation: OrientationAxis.ACQUISITION,
      width: 200,
      height: 200,
      useEnableElement: true,
    });

    return renderingEngine.getViewport(viewportId);
  });
}

/** Renders the viewport and resolves at its next IMAGE_RENDERED event. */
function renderAndWait(viewport) {
  return new Promise((resolve) => {
    viewport.element.addEventListener(Events.IMAGE_RENDERED, resolve, {
      once: true,
    });
    viewport.render();
  });
}

/** Registers a stack of four images as a display set and gives its id. */
function registerStack() {
  const imageIds = Array.from({ length: 4 }, (_, sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'imageURI',
      id: 'voiSyncStack',
      rows: 64,
      columns: 64,
      barStart: 10,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex,
    })
  );

  cornerstone3D.displaySetRegistry.add('voiSyncStack', {
    imageIds,
  });

  return 'voiSyncStack';
}

/** Makes a volume, registers it as a display set and gives its id. */
async function registerVolume() {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'voiSyncVolume',
    id: 'voiSyncVolume',
    rows: 30,
    columns: 40,
    slices: 12,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
  cornerstone3D.displaySetRegistry.add('voiSyncVolume', {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });

  return 'voiSyncVolume';
}

/**
 * Shows the display set on both viewports, with the mount options, and links
 * them with a VOI synchronizer that syncs the invert, the first viewport as
 * the source.
 */
async function showAndLink(viewports, displaySetId, options = {}) {
  const synchronizer = synchronizers.createVOISynchronizer(synchronizerId, {
    syncInvertState: true,
    syncColormap: true,
  });

  for (const viewport of viewports) {
    await viewport.setDisplaySets({ displaySetId, options });
    await renderAndWait(viewport);
  }

  const [source, target] = viewports.map((viewport) => ({
    renderingEngineId,
    viewportId: viewport.id,
  }));

  synchronizer.addSource(source);
  synchronizer.addTarget(target);
}

/** The invert of the presentation of the source display set of a viewport. */
function invertOf(viewport) {
  return viewport.getDisplaySetAppearance(viewport.getSourceDisplaySetId())
    ?.invert;
}

describe('VOI synchronizer on direct next planar viewports -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId, synchronizerId });
  });

  it('gives the target the invert of the source in stack mode', async function () {
    const [source, target] = createNextViewports(renderingEngine);
    const displaySetId = registerStack();

    await showAndLink([source, target], displaySetId);

    expect(source.getCurrentMode()).toBe('stack');
    expect(Boolean(invertOf(target))).toBe(false);

    source.setDisplaySetAppearance(displaySetId, { invert: true });

    expect(invertOf(target)).toBe(true);

    source.setDisplaySetAppearance(displaySetId, { invert: false });

    expect(invertOf(target)).toBe(false);
  });

  it('gives the target the invert of the source in volume mode', async function () {
    const [source, target] = createNextViewports(renderingEngine);
    const displaySetId = await registerVolume();

    await showAndLink([source, target], displaySetId, { mode: 'volume' });

    expect(source.getCurrentMode()).toBe('volume');
    expect(Boolean(invertOf(target))).toBe(false);

    source.setDisplaySetAppearance(displaySetId, { invert: true });

    expect(invertOf(target)).toBe(true);

    source.setDisplaySetAppearance(displaySetId, { invert: false });

    expect(invertOf(target)).toBe(false);
  });

  it('keeps the invert of the target when the source changes its window only', async function () {
    const [source, target] = createNextViewports(renderingEngine);
    const displaySetId = registerStack();

    await showAndLink([source, target], displaySetId);
    target.setDisplaySetAppearance(displaySetId, { invert: true });
    source.setDisplaySetAppearance(displaySetId, {
      voiRange: { lower: 10, upper: 90 },
    });

    expect(invertOf(source)).toBeUndefined();
    expect(invertOf(target)).toBe(true);
    expect(target.getDisplaySetAppearance(displaySetId).voiRange).toEqual({
      lower: 10,
      upper: 90,
    });
  });

  it('gives a stack of other images the window of the source stack, as the legacy stack viewport', async function () {
    const [source, target] = createNextViewports(renderingEngine);
    const sourceDisplaySetId = registerStack();
    const targetDisplaySetId = 'voiSyncOtherStack';

    cornerstone3D.displaySetRegistry.add(targetDisplaySetId, {
      imageIds: Array.from({ length: 4 }, (_, sliceIndex) =>
        testUtils.encodeImageIdInfo({
          loader: 'fakeImageLoader',
          name: 'imageURI',
          id: targetDisplaySetId,
          rows: 64,
          columns: 64,
          barStart: 20,
          barWidth: 5,
          xSpacing: 1,
          ySpacing: 1,
          sliceIndex,
        })
      ),
    });

    const synchronizer = synchronizers.createVOISynchronizer(synchronizerId, {
      syncInvertState: true,
      syncColormap: true,
    });

    await source.setDisplaySets({ displaySetId: sourceDisplaySetId });
    await renderAndWait(source);
    await target.setDisplaySets({ displaySetId: targetDisplaySetId });
    await renderAndWait(target);
    synchronizer.addSource({ renderingEngineId, viewportId: source.id });
    synchronizer.addTarget({ renderingEngineId, viewportId: target.id });

    source.setDisplaySetAppearance(sourceDisplaySetId, {
      voiRange: { lower: 10, upper: 90 },
    });

    expect(target.getCurrentMode()).toBe('stack');
    expect(target.getDisplaySetAppearance(targetDisplaySetId).voiRange).toEqual(
      {
        lower: 10,
        upper: 90,
      }
    );
  });

  for (const [mode, register] of [
    ['stack', async () => registerStack()],
    ['volume', registerVolume],
  ]) {
    it(`writes no override in the other viewport when a display set mounts in one of two viewports that synchronise each other, in ${mode} mode`, async function () {
      const [first, second] = createNextViewports(renderingEngine);
      const displaySetId = await register();
      const synchronizer = synchronizers.createVOISynchronizer(synchronizerId, {
        syncInvertState: true,
        syncColormap: true,
      });

      [first, second].forEach((viewport) => {
        synchronizer.add({ renderingEngineId, viewportId: viewport.id });
      });

      await first.setDisplaySets({ displaySetId, options: { mode } });
      await renderAndWait(first);
      await second.setDisplaySets({ displaySetId, options: { mode } });
      await renderAndWait(second);
      await first.setDisplaySets({ displaySetId, options: { mode } });
      await renderAndWait(first);

      expect(first.getCurrentMode()).toBe(mode);
      expect(first.getDisplaySetAppearance(displaySetId)).toEqual({});
      expect(second.getDisplaySetAppearance(displaySetId)).toEqual({});
      expect(
        second.getEffectiveDisplaySetAppearance(displaySetId).voiRange
      ).toEqual(second.getDefaultVOIRange(displaySetId));
    });
  }

  it('resets the window of the target when the source resets its window, and copies no default of the source', async function () {
    const [source, target] = createNextViewports(renderingEngine);
    const displaySetId = registerStack();

    await showAndLink([source, target], displaySetId);
    target.setDisplaySetAppearance(displaySetId, { invert: true });
    source.setDisplaySetAppearance(displaySetId, {
      voiRange: { lower: 10, upper: 90 },
    });

    expect(target.getDisplaySetAppearance(displaySetId)).toEqual({
      invert: true,
      voiRange: { lower: 10, upper: 90 },
    });

    source.resetDisplaySetAppearance(displaySetId);

    expect(source.getDisplaySetAppearance(displaySetId)).toEqual({});
    expect(target.getDisplaySetAppearance(displaySetId)).toEqual({
      invert: true,
    });
  });
});
