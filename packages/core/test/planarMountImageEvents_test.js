import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createLegacyViewport,
  createNextViewport,
  createSeries,
  renderAndWait,
  SERIES_SIZE,
  waitFor,
} from './utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { Events, OrientationAxis, ViewportType } = Enums;

const renderingEngineId = utilities.uuidv4();

/** The draw paths of a volume on a direct next planar viewport. */
const VOLUME_PATHS = [
  ['on the sampled slice path', {}, 'vtkSampledSlice'],
  ['on the volume slice path', { sliceFirst: false }, 'vtkVolumeSlice'],
  ['on the CPU', { renderBackend: 'cpu' }, 'cpuVolume'],
];

/** The draw paths of a stack on a direct next planar viewport. */
const STACK_PATHS = [
  ['on the GPU', {}, 'vtkImage'],
  ['on the CPU', { renderBackend: 'cpu' }, 'cpuImage'],
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
  element.addEventListener(Events.STACK_NEW_IMAGE, (evt) => {
    events.stack.push(evt.detail);
  });
  element.addEventListener(Events.VOLUME_NEW_IMAGE, (evt) => {
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

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds: series.imageIds,
    volumeId: series.volumeId,
    ...fields,
  });

  return displaySetId;
}

/** Registers the display set of a stack and gives its id. */
function addStackDisplaySet(viewport, series, initialImageIdIndex) {
  const displaySetId = `stack:${viewport.id}`;

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds: series.imageIds,
    kind: 'planar',
    initialImageIdIndex,
  });

  return displaySetId;
}

/** The one NEW_IMAGE that a volume fires for a slice. */
function newImageOfSlice(viewport, { imageId, imageIdIndex, numberOfSlices }) {
  return [
    {
      viewportId: viewport.id,
      renderingEngineId,
      imageIdIndex,
      numberOfSlices,
      imageId,
      image: undefined,
    },
  ];
}

/** The one NEW_IMAGE that a stack fires for an image. */
function newImageOfStack(viewport, series, imageIdIndex) {
  return [
    {
      viewportId: viewport.id,
      renderingEngineId,
      imageIdIndex,
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

  for (const [path, pathOptions, renderMode] of VOLUME_PATHS) {
    it(`fires NEW_IMAGE once for the slice that the mount of a volume shows, and not the old pair ${path}`, async function () {
      const series = await createSeries({ id: `mount-${renderMode}` });
      const viewport = createNextViewport(renderingEngine, 'nextMount');
      const events = recordNewImageEvents(viewport.element);

      await viewport.setDisplaySets({
        displaySetId: addVolumeDisplaySet(viewport, series),
        options: { orientation: OrientationAxis.ACQUISITION, ...pathOptions },
      });
      await firstRenderDone(viewport);

      const imageIdIndex = viewport.getCurrentImageIdIndex();
      const imageId = viewport.getCurrentImageId();

      expect(viewport.getCurrentMode()).toBe('volume');
      expect(viewport.getRenderPlan()[0].renderMode).toBe(renderMode);
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
      const series = await createSeries({ id: `mount-first-${renderMode}` });
      const viewport = createNextViewport(renderingEngine, 'nextMount');
      const events = recordNewImageEvents(viewport.element);

      await viewport.setDisplaySets({
        displaySetId: addVolumeDisplaySet(viewport, series, {
          initialImageIdIndex: 6,
        }),
        options: { orientation: OrientationAxis.ACQUISITION, ...pathOptions },
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
        id: `mount-same-${renderMode}`,
        size: { ...SERIES_SIZE, slices: 7 },
      });
      const viewport = createNextViewport(renderingEngine, 'nextMount');
      const events = recordNewImageEvents(viewport.element);

      await viewport.setDisplaySets({
        displaySetId: addVolumeDisplaySet(viewport, series, {
          initialImageIdIndex: 3,
        }),
        options: { orientation: OrientationAxis.ACQUISITION, ...pathOptions },
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
      const series = await createSeries({ id: `mount-across-${renderMode}` });
      const viewport = createNextViewport(renderingEngine, 'nextMount');
      const events = recordNewImageEvents(viewport.element);

      await viewport.setDisplaySets({
        displaySetId: addVolumeDisplaySet(viewport, series),
        options: { orientation: OrientationAxis.SAGITTAL, ...pathOptions },
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
      const series = await createSeries({ id: `mount-source-${renderMode}` });
      const over = await createSeries({ id: `mount-over-${renderMode}` });
      const viewport = createNextViewport(renderingEngine, 'nextMount');
      const events = recordNewImageEvents(viewport.element);

      await viewport.setDisplaySets(
        {
          displaySetId: addVolumeDisplaySet(viewport, series),
          options: {
            orientation: OrientationAxis.ACQUISITION,
            ...pathOptions,
          },
        },
        {
          displaySetId: addVolumeDisplaySet(viewport, over),
          options: {
            orientation: OrientationAxis.ACQUISITION,
            ...pathOptions,
          },
        }
      );
      await firstRenderDone(viewport);

      const imageIdIndex = viewport.getCurrentImageIdIndex();
      const imageId = viewport.getCurrentImageId();

      expect(viewport.getRenderPlan().map((layer) => layer.renderMode)).toEqual(
        [renderMode, renderMode]
      );
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
      const series = await createSeries({ id: `scroll-${renderMode}` });
      const viewport = createNextViewport(renderingEngine, 'nextMount');
      const events = recordNewImageEvents(viewport.element);

      await viewport.setDisplaySets({
        displaySetId: addVolumeDisplaySet(viewport, series, {
          initialImageIdIndex: 6,
        }),
        options: { orientation: OrientationAxis.ACQUISITION, ...pathOptions },
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

  for (const [path, pathOptions, renderMode] of STACK_PATHS) {
    for (const first of [0, 5]) {
      it(`fires NEW_IMAGE once, and not the old pair, for the mount of a stack at its image ${first} ${path}`, async function () {
        const series = await createSeries({ id: `mount-${renderMode}` });
        const viewport = createNextViewport(renderingEngine, 'nextMount');
        const events = recordNewImageEvents(viewport.element);

        await viewport.setDisplaySets({
          displaySetId: addStackDisplaySet(viewport, series, first),
          options: { orientation: OrientationAxis.ACQUISITION, ...pathOptions },
        });
        await firstRenderDone(viewport);

        expect(viewport.getCurrentMode()).toBe('stack');
        expect(viewport.getRenderPlan()[0].renderMode).toBe(renderMode);
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
      const series = await createSeries({ id: `scroll-${renderMode}` });
      const viewport = createNextViewport(renderingEngine, 'nextMount');
      const events = recordNewImageEvents(viewport.element);

      await viewport.setDisplaySets({
        displaySetId: addStackDisplaySet(viewport, series, 2),
        options: { orientation: OrientationAxis.ACQUISITION, ...pathOptions },
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

  /**
   * What the legacy adapters fire for a series. The legacy volume viewport
   * class of 5.x fired VOLUME_NEW_IMAGE once, for image index 3 of 8 slices,
   * and no STACK_NEW_IMAGE. Its adapter fires both twice: first as the volume
   * is attached, for the index of its middle image, then for the slice that
   * the mount shows. The legacy stack viewport class fired STACK_NEW_IMAGE
   * once, as its adapter does. An adapter is a next viewport too, so it also
   * fires NEW_IMAGE, once for what the mount shows.
   */
  it('keeps the old pair that the legacy adapters fire at a mount, and fires NEW_IMAGE once too', async function () {
    const series = await createSeries({ id: 'mount-legacy' });
    const fired = {};

    for (const [id, type] of [
      ['adapterVolume', ViewportType.ORTHOGRAPHIC],
      ['adapterStack', ViewportType.STACK],
    ]) {
      const viewport = createLegacyViewport(renderingEngine, id, type, {
        orientation: OrientationAxis.AXIAL,
      });
      const events = recordNewImageEvents(viewport.element);

      if (type === ViewportType.STACK) {
        await viewport.setStack(series.imageIds, 0);
      } else {
        await viewport.setVolumes([{ volumeId: series.volumeId }]);
      }

      await firstRenderDone(viewport);
      fired[id] = {
        stack: events.stack.map(({ imageId, imageIdIndex }) => ({
          image: series.imageIds.indexOf(imageId),
          imageIdIndex,
        })),
        volume: events.volume.map(({ imageIndex, numberOfSlices }) => ({
          imageIndex,
          numberOfSlices,
        })),
        newImage: events.newImage.map(
          ({ imageId, imageIdIndex, numberOfSlices, image }) => ({
            image: series.imageIds.indexOf(imageId),
            imageIdIndex,
            numberOfSlices,
            hasImage: image !== undefined,
          })
        ),
        sliceIndex: viewport.getCurrentImageIdIndex(),
        imageOnDisplay: series.imageIds.indexOf(viewport.getCurrentImageId()),
      };
    }

    expect(fired.adapterVolume).toEqual({
      stack: [
        { image: 4, imageIdIndex: 4 },
        { image: 3, imageIdIndex: 3 },
      ],
      volume: [
        { imageIndex: 4, numberOfSlices: 8 },
        { imageIndex: 3, numberOfSlices: 8 },
      ],
      newImage: [
        { image: 4, imageIdIndex: 3, numberOfSlices: 8, hasImage: false },
      ],
      sliceIndex: 3,
      imageOnDisplay: 4,
    });
    expect(fired.adapterStack).toEqual({
      stack: [{ image: 0, imageIdIndex: 0 }],
      volume: [],
      newImage: [
        { image: 0, imageIdIndex: 0, numberOfSlices: 8, hasImage: true },
      ],
      sliceIndex: 0,
      imageOnDisplay: 0,
    });
  });
});
