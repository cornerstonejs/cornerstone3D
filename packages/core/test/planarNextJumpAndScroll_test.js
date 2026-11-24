import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { SERIES_SIZE, createSeries } from './utils/planarSeriesBothModes';

const { Enums, volumeLoader, utilities, cache, eventTarget } = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;

const renderingEngineId = utilities.uuidv4();

/** Makes a direct next planar viewport of 400 by 300 pixels. */
function createNextViewport(renderingEngine, viewportId = 'next') {
  testUtils.createViewports(renderingEngine, {
    viewportId,
    viewportType: ViewportType.PLANAR,
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

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds,
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({ displaySetId });
  await renderAndWait(viewport);

  return displaySetId;
}

/**
 * Makes a volume of 40 columns, 30 rows and a number of slices 1 mm apart
 * and shows it on the viewport in an orientation.
 */
async function showVolume(
  viewport,
  orientation = OrientationAxis.AXIAL,
  slices = 12
) {
  const displaySetId = `volume:${viewport.id}`;
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'jumpAndScrollVolume',
    id: `jumpAndScrollVolume${slices}`,
    rows: 30,
    columns: 40,
    slices,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({ displaySetId, options: { orientation } });
  await renderAndWait(viewport);

  return displaySetId;
}

/**
 * Shows a volume of 13 slices 1 mm apart with a second volume over it, of 5
 * slices 3 mm apart over the same depth. Gives the id of the second volume.
 */
async function showTwoVolumes(viewport) {
  const fine = await createSeries({
    id: 'scrollFine',
    size: { ...SERIES_SIZE, slices: 13, sliceSpacing: 1 },
  });
  const coarse = await createSeries({
    id: 'scrollCoarse',
    size: { ...SERIES_SIZE, slices: 5, sliceSpacing: 3 },
  });
  const options = { orientation: OrientationAxis.ACQUISITION };

  [fine, coarse].forEach(({ imageIds, volumeId }) => {
    cornerstone3D.displaySetRegistry.add(volumeId, {
      imageIds,
      volumeId,
    });
  });
  await viewport.setDisplaySets(
    { displaySetId: fine.volumeId, options },
    { displaySetId: coarse.volumeId, options }
  );
  await renderAndWait(viewport);

  return coarse.volumeId;
}

/** Where the slice on display lies along the view normal, in millimetres. */
function slicePosition(viewport) {
  const { focalPoint, viewPlaneNormal } = viewport
    .getResolvedView()
    .toICamera();

  return (
    focalPoint[0] * viewPlaneNormal[0] +
    focalPoint[1] * viewPlaneNormal[1] +
    focalPoint[2] * viewPlaneNormal[2]
  );
}

/** Scrolls with the options and gives how far the slice moved, in mm. */
function scrollAndMeasure(viewport, options) {
  const before = slicePosition(viewport);

  utilities.scroll(viewport, options);

  return Math.abs(slicePosition(viewport) - before);
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
    cornerstone3D.displaySetRegistry.clear?.();
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

    it('counts the index in the slices of another volume with its volumeId in volume mode', async function () {
      const viewport = createNextViewport(renderingEngine);
      const coarseVolumeId = await showTwoVolumes(viewport);

      await utilities.jumpToSlice(viewport.element, { imageIndex: 3 });
      await utilities.jumpToSlice(viewport.element, {
        imageIndex: 2,
        volumeId: coarseVolumeId,
      });

      expect(viewport.getCurrentImageIdIndex()).toBe(6);

      await utilities.jumpToSlice(viewport.element, {
        imageIndex: 1,
        volumeId: coarseVolumeId,
      });

      expect(viewport.getCurrentImageIdIndex()).toBe(3);

      await utilities.jumpToSlice(viewport.element, {
        imageIndex: 40,
        volumeId: coarseVolumeId,
      });

      expect(viewport.getCurrentImageIdIndex()).toBe(12);
    });
  });

  describe('utilities.scroll', () => {
    /**
     * STACK_SCROLL_OUT_OF_BOUNDS is the event of the legacy stack viewport. A
     * legacy volume viewport fired the volume scroll events in its place
     * (measured on 58914567b), and so does volume mode:
     * `planarScrollEvents_test.js`.
     */
    const modes = [
      {
        mode: 'stack',
        show: showStack,
        slices: 10,
        stackOutOfBounds: [
          { imageIdIndex: 4, direction: 40 },
          { imageIdIndex: 9, direction: -40 },
        ],
      },
      { mode: 'volume', show: showVolume, slices: 12, stackOutOfBounds: [] },
    ];

    modes.forEach(({ mode, show, slices, stackOutOfBounds }) => {
      it(`steps by delta slices in ${mode} mode and stops at both ends`, async function () {
        const viewport = createNextViewport(renderingEngine);
        const outOfBounds = [];
        const onOutOfBounds = (evt) => outOfBounds.push(evt.detail);

        await show(viewport);
        await utilities.jumpToSlice(viewport.element, { imageIndex: 3 });
        eventTarget.addEventListener(
          Events.STACK_SCROLL_OUT_OF_BOUNDS,
          onOutOfBounds
        );

        const indices = [2, -1, 40, -40].map((delta) => {
          utilities.scroll(viewport, { delta });

          return viewport.getCurrentImageIdIndex();
        });

        eventTarget.removeEventListener(
          Events.STACK_SCROLL_OUT_OF_BOUNDS,
          onOutOfBounds
        );
        await renderAndWait(viewport);

        expect(viewport.getCurrentMode()).toBe(mode);
        expect(indices).toEqual([5, 4, slices - 1, 0]);
        expect(outOfBounds).toEqual(stackOutOfBounds);
      });

      it(`wraps at both ends with loop in ${mode} mode`, async function () {
        const viewport = createNextViewport(renderingEngine);

        await show(viewport);
        await utilities.jumpToSlice(viewport.element, { imageIndex: 0 });

        const indices = [-1, 1, 3, slices - 2, -2].map((delta) => {
          utilities.scroll(viewport, { delta, loop: true });

          return viewport.getCurrentImageIdIndex();
        });

        await renderAndWait(viewport);

        expect(viewport.getCurrentMode()).toBe(mode);
        expect(indices).toEqual([slices - 1, 0, 3, 1, slices - 1]);
      });

      it(`gives the slice index and the number of slices without arguments in ${mode} mode`, async function () {
        const viewport = createNextViewport(renderingEngine);
        const displaySetId = await show(viewport);

        await utilities.jumpToSlice(viewport.element, { imageIndex: 6 });
        viewport.setDisplaySetAppearance(displaySetId, { slabThickness: 4 });

        expect(viewport.getNumberOfSlices()).toBe(slices);
        expect(viewport.getNumberOfSlices(undefined, true)).toBe(slices);
        expect(viewport.getCurrentImageIdIndex()).toBe(6);
        expect(viewport.getCurrentImageIdIndex(undefined, true)).toBe(6);
      });
    });

    it('steps by the slab thickness with scrollSlabs in volume mode, and by one slice without it', async function () {
      const viewport = createNextViewport(renderingEngine);
      const displaySetId = await showVolume(
        viewport,
        OrientationAxis.AXIAL,
        13
      );

      await utilities.jumpToSlice(viewport.element, { imageIndex: 4 });
      viewport.setDisplaySetAppearance(displaySetId, { slabThickness: 4 });

      expect(
        scrollAndMeasure(viewport, { delta: 1, scrollSlabs: true })
      ).toBeCloseTo(4, 4);
      expect(viewport.getCurrentImageIdIndex()).toBe(8);
      expect(
        scrollAndMeasure(viewport, { delta: -2, scrollSlabs: true })
      ).toBeCloseTo(8, 4);
      expect(viewport.getCurrentImageIdIndex()).toBe(0);
      expect(scrollAndMeasure(viewport, { delta: 1 })).toBeCloseTo(1, 4);
      expect(viewport.getCurrentImageIdIndex()).toBe(1);
    });

    it('wraps slab steps at both ends with loop in volume mode', async function () {
      const viewport = createNextViewport(renderingEngine);
      const displaySetId = await showVolume(
        viewport,
        OrientationAxis.AXIAL,
        13
      );

      viewport.setDisplaySetAppearance(displaySetId, { slabThickness: 4 });
      await utilities.jumpToSlice(viewport.element, { imageIndex: 0 });

      const indices = [-1, 1, 2, 3].map((delta) => {
        utilities.scroll(viewport, { delta, scrollSlabs: true, loop: true });

        return viewport.getCurrentImageIdIndex();
      });

      expect(indices).toEqual([12, 0, 8, 4]);
    });

    it('steps by one image with scrollSlabs in stack mode, where there is no slab', async function () {
      const viewport = createNextViewport(renderingEngine);

      await showStack(viewport);
      await utilities.jumpToSlice(viewport.element, { imageIndex: 2 });
      utilities.scroll(viewport, { delta: 1, scrollSlabs: true });

      expect(viewport.getCurrentImageIdIndex()).toBe(3);

      utilities.scroll(viewport, { delta: -2, scrollSlabs: true });
      await renderAndWait(viewport);

      expect(viewport.getCurrentImageIdIndex()).toBe(1);
    });

    it('steps by the spacing of another volume of the viewport with volumeId in volume mode', async function () {
      const viewport = createNextViewport(renderingEngine);
      const coarseVolumeId = await showTwoVolumes(viewport);

      await utilities.jumpToSlice(viewport.element, { imageIndex: 3 });

      expect(viewport.getNumberOfSlices()).toBe(13);
      expect(
        scrollAndMeasure(viewport, { delta: 1, volumeId: coarseVolumeId })
      ).toBeCloseTo(3, 4);
      expect(viewport.getCurrentImageIdIndex()).toBe(6);
      expect(scrollAndMeasure(viewport, { delta: 1 })).toBeCloseTo(1, 4);
      expect(viewport.getCurrentImageIdIndex()).toBe(7);
    });

    it('steps by one slice with a volumeId that names no volume of the viewport in volume mode', async function () {
      const viewport = createNextViewport(renderingEngine);

      await showVolume(viewport);
      await utilities.jumpToSlice(viewport.element, { imageIndex: 2 });

      expect(
        scrollAndMeasure(viewport, { delta: 1, volumeId: 'anotherVolume' })
      ).toBeCloseTo(1, 4);
      expect(viewport.getCurrentImageIdIndex()).toBe(3);
    });

    it('steps by one image with a volumeId in stack mode, where there is no other volume', async function () {
      const viewport = createNextViewport(renderingEngine);

      await showStack(viewport);
      await utilities.jumpToSlice(viewport.element, { imageIndex: 2 });
      utilities.scroll(viewport, { delta: 1, volumeId: 'anotherVolume' });
      await renderAndWait(viewport);

      expect(viewport.getCurrentImageIdIndex()).toBe(3);
    });
  });
});
