import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities, cache } = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;

const renderingEngineId = utilities.uuidv4();

/** Makes a direct next planar viewport of 400 by 300 pixels. */
function createNextViewport(renderingEngine, viewportId = 'next') {
  testUtils.createViewports(renderingEngine, {
    viewportId,
    viewportType: ViewportType.PLANAR_NEXT,
    orientation: OrientationAxis.ACQUISITION,
    width: 400,
    height: 300,
    useEnableElement: true,
  });

  return renderingEngine.getViewport(viewportId);
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

/** Shows a stack of 10 images 1 mm apart along z on the viewport. */
async function showStack(viewport) {
  const displaySetId = `stack:${viewport.id}`;
  const imageIds = Array.from({ length: 10 }, (_, sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'imageURI',
      id: 'jumpAndScrollStack',
      rows: 64,
      columns: 64,
      barStart: 10,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex,
    })
  );

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({ displaySetId });
  await renderAndWait(viewport);

  return displaySetId;
}

/**
 * Makes a volume of 40 columns, 30 rows and 12 slices and shows it on the
 * viewport in an orientation.
 */
async function showVolume(viewport, orientation = OrientationAxis.AXIAL) {
  const displaySetId = `volume:${viewport.id}`;
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'jumpAndScrollVolume',
    id: 'jumpAndScrollVolume',
    rows: 30,
    columns: 40,
    slices: 12,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({ displaySetId, options: { orientation } });
  await renderAndWait(viewport);

  return displaySetId;
}

describe('Jump and scroll on a direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  describe('utilities.jumpToSlice', () => {
    it('goes to an image index in stack mode', async function () {
      const viewport = createNextViewport(renderingEngine);

      await showStack(viewport);
      await utilities.jumpToSlice(viewport.element, { imageIndex: 7 });

      expect(viewport.getCurrentMode()).toBe('stack');
      expect(viewport.getCurrentImageIdIndex()).toBe(7);

      await utilities.jumpToSlice(viewport.element, {
        imageIndex: 2,
        debounceLoading: true,
      });

      expect(viewport.getCurrentImageIdIndex()).toBe(2);

      await utilities.jumpToSlice(viewport.element, { imageIndex: 40 });

      expect(viewport.getCurrentImageIdIndex()).toBe(9);
    });

    it('goes to a slice index in volume mode', async function () {
      const viewport = createNextViewport(renderingEngine);

      await showVolume(viewport);
      await utilities.jumpToSlice(viewport.element, { imageIndex: 7 });

      expect(viewport.getCurrentMode()).toBe('volume');
      expect(viewport.getNumberOfSlices()).toBe(12);
      expect(viewport.getCurrentImageIdIndex()).toBe(7);

      await utilities.jumpToSlice(viewport.element, {
        imageIndex: 2,
        debounceLoading: true,
      });

      expect(viewport.getCurrentImageIdIndex()).toBe(2);

      await utilities.jumpToSlice(viewport.element, { imageIndex: 40 });

      expect(viewport.getCurrentImageIdIndex()).toBe(11);
    });
  });
});
