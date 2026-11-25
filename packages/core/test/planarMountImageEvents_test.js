import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  SERIES_SIZE,
  waitFor,
  drawPathOf,
} from './utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { Events, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/** The draw paths of a volume on a direct next planar viewport. */
const VOLUME_PATHS = [
  ['on the sampled slice path', {}, 'cpu-gpu'],
  ['on the volume slice path', { sliceFirst: false }, 'gpuVolume-gpu'],
  ['on the CPU', { renderBackend: 'cpu' }, 'cpu-cpu'],
];

/** The draw paths of a stack on a direct next planar viewport. */
const STACK_PATHS = [
  ['on the GPU', {}, 'frame-gpu'],
  ['on the CPU', { renderBackend: 'cpu' }, 'frame-cpu'],
];

/** Resolves after a few animation frames. */
async function frames(count = 4) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * Records the new image events of an element from now on: NEW_IMAGE, and the
 * old pair that only a legacy adapter fires.
 */
function recordNewImageEvents(element) {
  const events = { newImage: [], stack: [], volume: [] };

  element.addEventListener(Events.NEW_IMAGE, (evt) => {
    events.newImage.push(evt.detail);
  });
  element.addEventListener('CORNERSTONE_STACK_NEW_IMAGE', (evt) => {
    events.stack.push(evt.detail);
  });
  element.addEventListener('CORNERSTONE_VOLUME_NEW_IMAGE', (evt) => {
    events.volume.push(evt.detail);
  });

  return events;
}

/** Waits until the first render after a mount is done, and a little longer. */
async function firstRenderDone(viewport) {
  await renderAndWait(viewport);
  await frames();
}

/** Registers the display set of a volume and gives its id. */
function addVolumeDisplaySet(viewport, series, fields = {}) {
  const displaySetId = `volume:${viewport.id}:${series.volumeId}`;

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds: series.imageIds,
    volumeId: series.volumeId,
    ...fields,
  });

  return displaySetId;
}

/** Registers the display set of a stack and gives its id. */
function addStackDisplaySet(viewport, series) {
  const displaySetId = `stack:${viewport.id}`;

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds: series.imageIds,
  });

  return displaySetId;
}

/**
 * The one NEW_IMAGE that a volume fires for a slice: of the source display
 * set, with the slice index of the view as `sliceIndex`.
 */
function newImageOfSlice(viewport, { imageId, imageIdIndex, numberOfSlices }) {
  return [
    {
      viewportId: viewport.id,
      renderingEngineId,
      displaySetId: viewport.getSourceDisplaySetId(),
      sliceIndex: imageIdIndex,
      numberOfSlices,
      imageId,
      image: undefined,
    },
  ];
}

/**
 * The one NEW_IMAGE that a stack fires for an image: of the source display
 * set, with the index of the image as `sliceIndex`.
 */
function newImageOfStack(viewport, series, imageIdIndex) {
  return [
    {
      viewportId: viewport.id,
      renderingEngineId,
      displaySetId: viewport.getSourceDisplaySetId(),
      sliceIndex: imageIdIndex,
      numberOfSlices: series.imageIds.length,
      imageId: series.imageIds[imageIdIndex],
      image: jasmine.objectContaining({
        imageId: series.imageIds[imageIdIndex],
      }),
    },
  ];
}

/** Expects that the element fired neither event of the old pair. */
function expectNoOldPair(events) {
  expect(events.stack).toEqual([]);
  expect(events.volume).toEqual([]);
}

/** Forgets the events recorded so far. */
function clearEvents(events) {
  events.newImage.length = 0;
  events.stack.length = 0;
  events.volume.length = 0;
}

describe('The new image event of a mount and of a scroll on a planar viewport -- ', () => {
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
  });

  for (const [path, pathOptions, drawPath] of VOLUME_PATHS) {
    it(`fires NEW_IMAGE once for the slice that the mount of a volume shows, and not the old pair ${path}`, async function () {
      const series = await createSeries({ id: `mount-${drawPath}` });
      const viewport = createNextViewport(renderingEngine, 'nextMount');
      const events = recordNewImageEvents(viewport.element);

      await viewport.setDisplaySets({
        displaySetId: addVolumeDisplaySet(viewport, series),
        options: {
          mode: 'volume',
          orientation: OrientationAxis.ACQUISITION,
          ...pathOptions,
        },
      });
      await firstRenderDone(viewport);

      const imageIdIndex = viewport.getCurrentImageIdIndex();
      const imageId = viewport.getCurrentImageId();

      expect(viewport.getCurrentMode()).toBe('volume');
      expect(drawPathOf(viewport.getRenderPlan()[0])).toBe(drawPath);
      expect(imageIdIndex).toBeGreaterThan(0);
      expect(series.imageIds).toContain(imageId);
      expect(viewport.getNumberOfSlices()).toBe(series.size.slices);
      expect(events.newImage).toEqual(
        newImageOfSlice(viewport, {
          imageId,
          imageIdIndex,
          numberOfSlices: series.size.slices,
        })
      );
      expectNoOldPair(events);
    });

    it(`fires NEW_IMAGE once for the slice of the first image index of a volume ${path}`, async function () {
      const series = await createSeries({ id: `mount-first-${drawPath}` });
      const viewport = createNextViewport(renderingEngine, 'nextMount');
      const events = recordNewImageEvents(viewport.element);

      await viewport.setDisplaySets({
        displaySetId: addVolumeDisplaySet(viewport, series),
        options: {
          mode: 'volume',
          orientation: OrientationAxis.ACQUISITION,
          initialImageIdIndex: 6,
          ...pathOptions,
        },
      });
      await firstRenderDone(viewport);

      const imageIdIndex = viewport.getCurrentImageIdIndex();

      expect(viewport.getCurrentImageId()).toBe(series.imageIds[6]);
      expect(imageIdIndex).toBe(series.size.slices - 1 - 6);
      expect(events.newImage).toEqual(
        newImageOfSlice(viewport, {
          imageId: series.imageIds[6],
          imageIdIndex,
          numberOfSlices: series.size.slices,
        })
      );
      expectNoOldPair(events);
    });

    it(`fires NEW_IMAGE once when the first slice has the index that the rendering starts with ${path}`, async function () {
      const series = await createSeries({
        id: `mount-same-${drawPath}`,
        size: { ...SERIES_SIZE, slices: 7 },
      });
      const viewport = createNextViewport(renderingEngine, 'nextMount');
      const events = recordNewImageEvents(viewport.element);

      await viewport.setDisplaySets({
        displaySetId: addVolumeDisplaySet(viewport, series),
        options: {
          mode: 'volume',
          orientation: OrientationAxis.ACQUISITION,
          initialImageIdIndex: 3,
          ...pathOptions,
        },
      });
      await firstRenderDone(viewport);

      expect(viewport.getCurrentImageId()).toBe(series.imageIds[3]);
      expect(viewport.getCurrentImageIdIndex()).toBe(3);
      expect(events.newImage).toEqual(
        newImageOfSlice(viewport, {
          imageId: series.imageIds[3],
          imageIdIndex: 3,
          numberOfSlices: 7,
        })
      );
      expectNoOldPair(events);
    });

    it(`fires NEW_IMAGE once, with the slice index of the view and no image id, for a volume that is cut across its images ${path}`, async function () {
      const series = await createSeries({ id: `mount-across-${drawPath}` });
      const viewport = createNextViewport(renderingEngine, 'nextMount');
      const events = recordNewImageEvents(viewport.element);

      await viewport.setDisplaySets({
        displaySetId: addVolumeDisplaySet(viewport, series),
        options: {
          mode: 'volume',
          orientation: OrientationAxis.SAGITTAL,
          ...pathOptions,
        },
      });
      await firstRenderDone(viewport);

      const imageIdIndex = viewport.getCurrentImageIdIndex();
      const numberOfSlices = viewport.getNumberOfSlices();

      expect(viewport.getCurrentImageId()).toBeUndefined();
      expect(imageIdIndex).toBeGreaterThan(0);
      expect(numberOfSlices).toBeGreaterThan(series.size.slices);
      expect(events.newImage).toEqual(
        newImageOfSlice(viewport, {
          imageId: undefined,
          imageIdIndex,
          numberOfSlices,
        })
      );
      expectNoOldPair(events);

      clearEvents(events);
      await viewport.scroll(1);
      await firstRenderDone(viewport);

      expect(viewport.getCurrentImageIdIndex()).toBe(imageIdIndex + 1);
      expect(events.newImage).toEqual(
        newImageOfSlice(viewport, {
          imageId: undefined,
          imageIdIndex: imageIdIndex + 1,
          numberOfSlices,
        })
      );
      expectNoOldPair(events);
    });

    it(`fires NEW_IMAGE once for the source when a second volume is mounted over it ${path}`, async function () {
      const series = await createSeries({ id: `mount-source-${drawPath}` });
      const over = await createSeries({ id: `mount-over-${drawPath}` });
      const viewport = createNextViewport(renderingEngine, 'nextMount');
      const events = recordNewImageEvents(viewport.element);

      await viewport.setDisplaySets(
        {
          displaySetId: addVolumeDisplaySet(viewport, series),
          options: {
            mode: 'volume',
            orientation: OrientationAxis.ACQUISITION,
            ...pathOptions,
          },
        },
        {
          displaySetId: addVolumeDisplaySet(viewport, over),
          options: {
            mode: 'volume',
            orientation: OrientationAxis.ACQUISITION,
            ...pathOptions,
          },
        }
      );
      await firstRenderDone(viewport);

      const imageIdIndex = viewport.getCurrentImageIdIndex();
      const imageId = viewport.getCurrentImageId();

      expect(viewport.getRenderPlan().map(drawPathOf)).toEqual([
        drawPath,
        drawPath,
      ]);
      expect(series.imageIds).toContain(imageId);
      expect(events.newImage).toEqual(
        newImageOfSlice(viewport, {
          imageId,
          imageIdIndex,
          numberOfSlices: series.size.slices,
        })
      );

      clearEvents(events);
      await viewport.scroll(1);
      await firstRenderDone(viewport);

      expect(events.newImage).toEqual(
        newImageOfSlice(viewport, {
          imageId: viewport.getCurrentImageId(),
          imageIdIndex: imageIdIndex + 1,
          numberOfSlices: series.size.slices,
        })
      );
      expectNoOldPair(events);
    });

    it(`fires NEW_IMAGE once for each scroll of a volume, and not the old pair ${path}`, async function () {
      const series = await createSeries({ id: `scroll-${drawPath}` });
      const viewport = createNextViewport(renderingEngine, 'nextMount');
      const events = recordNewImageEvents(viewport.element);

      await viewport.setDisplaySets({
        displaySetId: addVolumeDisplaySet(viewport, series),
        options: {
          mode: 'volume',
          orientation: OrientationAxis.ACQUISITION,
          initialImageIdIndex: 6,
          ...pathOptions,
        },
      });
      await firstRenderDone(viewport);

      const imageIdIndex = viewport.getCurrentImageIdIndex();
      const expected = [];

      clearEvents(events);

      for (const step of [1, 2, 3]) {
        await viewport.scroll(1);
        await firstRenderDone(viewport);

        expect(viewport.getCurrentImageIdIndex()).toBe(imageIdIndex + step);
        expect(viewport.getCurrentImageId()).toBe(series.imageIds[6 - step]);
        expected.push(
          ...newImageOfSlice(viewport, {
            imageId: series.imageIds[6 - step],
            imageIdIndex: imageIdIndex + step,
            numberOfSlices: series.size.slices,
          })
        );
      }

      expect(events.newImage).toEqual(expected);
      expectNoOldPair(events);
    });
  }

  for (const [path, pathOptions, drawPath] of STACK_PATHS) {
    for (const first of [0, 5]) {
      it(`fires NEW_IMAGE once, and not the old pair, for the mount of a stack at its image ${first} ${path}`, async function () {
        const series = await createSeries({ id: `mount-${drawPath}` });
        const viewport = createNextViewport(renderingEngine, 'nextMount');
        const events = recordNewImageEvents(viewport.element);

        await viewport.setDisplaySets({
          displaySetId: addStackDisplaySet(viewport, series),
          options: {
            orientation: OrientationAxis.ACQUISITION,
            initialImageIdIndex: first,
            ...pathOptions,
          },
        });
        await firstRenderDone(viewport);

        expect(viewport.getCurrentMode()).toBe('stack');
        expect(drawPathOf(viewport.getRenderPlan()[0])).toBe(drawPath);
        expect(viewport.getCurrentImageId()).toBe(series.imageIds[first]);
        expect(viewport.getCurrentImageIdIndex()).toBe(first);
        expect(viewport.getNumberOfSlices()).toBe(series.size.slices);
        expect(events.newImage).toEqual(
          newImageOfStack(viewport, series, first)
        );
        expectNoOldPair(events);
      });
    }

    it(`fires NEW_IMAGE once for each scroll of a stack, and not the old pair ${path}`, async function () {
      const series = await createSeries({ id: `scroll-${drawPath}` });
      const viewport = createNextViewport(renderingEngine, 'nextMount');
      const events = recordNewImageEvents(viewport.element);

      await viewport.setDisplaySets({
        displaySetId: addStackDisplaySet(viewport, series),
        options: {
          orientation: OrientationAxis.ACQUISITION,
          initialImageIdIndex: 2,
          ...pathOptions,
        },
      });
      await firstRenderDone(viewport);
      clearEvents(events);

      const expected = [];

      for (const imageIdIndex of [3, 4, 5]) {
        await viewport.scroll(1);
        await waitFor(() => events.newImage.length === expected.length + 1);
        await firstRenderDone(viewport);

        expect(viewport.getCurrentImageIdIndex()).toBe(imageIdIndex);
        expect(viewport.getCurrentImageId()).toBe(
          series.imageIds[imageIdIndex]
        );
        expected.push(...newImageOfStack(viewport, series, imageIdIndex));
      }

      expect(events.newImage).toEqual(expected);
      expectNoOldPair(events);
    });
  }
});
