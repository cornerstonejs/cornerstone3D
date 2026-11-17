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
      viewportType: ViewportType.PLANAR_NEXT,
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

  utilities.genericViewportDisplaySetMetadataProvider.add('voiSyncStack', {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: 0,
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
  utilities.genericViewportDisplaySetMetadataProvider.add('voiSyncVolume', {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });

  return 'voiSyncVolume';
}

/**
 * Shows the display set on both viewports and links them with a VOI
 * synchronizer that syncs the invert, the first viewport as the source.
 */
async function showAndLink(viewports, displaySetId) {
  const synchronizer = synchronizers.createVOISynchronizer(synchronizerId, {
    syncInvertState: true,
    syncColormap: true,
  });

  for (const viewport of viewports) {
    await viewport.setDisplaySets({ displaySetId });
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
  return viewport.getDisplaySetPresentation(viewport.getSourceDataId())?.invert;
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

    source.setDisplaySetPresentation(displaySetId, { invert: true });

    expect(invertOf(target)).toBe(true);

    source.setDisplaySetPresentation(displaySetId, { invert: false });

    expect(invertOf(target)).toBe(false);
  });

  it('gives the target the invert of the source in volume mode', async function () {
    const [source, target] = createNextViewports(renderingEngine);
    const displaySetId = await registerVolume();

    await showAndLink([source, target], displaySetId);

    expect(source.getCurrentMode()).toBe('volume');
    expect(Boolean(invertOf(target))).toBe(false);

    source.setDisplaySetPresentation(displaySetId, { invert: true });

    expect(invertOf(target)).toBe(true);

    source.setDisplaySetPresentation(displaySetId, { invert: false });

    expect(invertOf(target)).toBe(false);
  });

  it('keeps the invert of the target when the source changes its window only', async function () {
    const [source, target] = createNextViewports(renderingEngine);
    const displaySetId = registerStack();

    await showAndLink([source, target], displaySetId);
    target.setDisplaySetPresentation(displaySetId, { invert: true });
    source.setDisplaySetPresentation(displaySetId, {
      voiRange: { lower: 10, upper: 90 },
    });

    expect(invertOf(source)).toBeUndefined();
    expect(invertOf(target)).toBe(true);
    expect(target.getDisplaySetPresentation(displaySetId).voiRange).toEqual({
      lower: 10,
      upper: 90,
    });
  });
});
