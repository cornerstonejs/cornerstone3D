import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createLegacyViewport,
  createNextViewport,
  createSeries,
  renderAndWait,
  SERIES_SIZE,
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

/** Records the new image events of an element from now on. */
function recordNewImageEvents(element) {
  const events = { stack: [], volume: [] };

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

/** The one STACK_NEW_IMAGE that the mount of a volume fires. */
function stackEventOfSlice(viewport, { imageId, imageIdIndex }) {
  return [
    {
      image: undefined,
      imageId,
      imageIdIndex,
      viewportId: viewport.id,
      renderingEngineId,
    },
  ];
}

/** The one VOLUME_NEW_IMAGE that the mount of a volume fires. */
function volumeEventOfSlice(viewport, imageIndex, numberOfSlices) {
  return [
    {
      imageIndex,
      numberOfSlices,
      viewportId: viewport.id,
      renderingEngineId,
    },
  ];
}

describe('The new image events of a mount on a planar viewport -- ', () => {
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
    it(`fires STACK_NEW_IMAGE and VOLUME_NEW_IMAGE once for the slice that the mount of a volume shows ${path}`, async function () {
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
      expect(events.stack).toEqual(
        stackEventOfSlice(viewport, { imageId, imageIdIndex })
      );
      expect(events.volume).toEqual(
        volumeEventOfSlice(viewport, imageIdIndex, series.size.slices)
      );
    });

    it(`fires the new image events once for the slice of the first image index of a volume ${path}`, async function () {
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
      expect(events.stack).toEqual(
        stackEventOfSlice(viewport, {
          imageId: series.imageIds[6],
          imageIdIndex,
        })
      );
      expect(events.volume).toEqual(
        volumeEventOfSlice(viewport, imageIdIndex, series.size.slices)
      );
    });

    it(`fires the new image events once when the first slice has the index that the rendering starts with ${path}`, async function () {
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
      expect(events.stack).toEqual(
        stackEventOfSlice(viewport, {
          imageId: series.imageIds[3],
          imageIdIndex: 3,
        })
      );
      expect(events.volume).toEqual(volumeEventOfSlice(viewport, 3, 7));
    });

    it(`fires the new image events once for a volume that is cut across its images ${path}`, async function () {
      const series = await createSeries({ id: `mount-across-${renderMode}` });
      const viewport = createNextViewport(renderingEngine, 'nextMount');
      const events = recordNewImageEvents(viewport.element);

      await viewport.setDisplaySets({
        displaySetId: addVolumeDisplaySet(viewport, series),
        options: { orientation: OrientationAxis.SAGITTAL, ...pathOptions },
      });
      await firstRenderDone(viewport);

      const imageIdIndex = viewport.getCurrentImageIdIndex();

      expect(viewport.getCurrentImageId()).toBeUndefined();
      expect(imageIdIndex).toBeGreaterThan(0);
      expect(events.stack).toEqual(
        stackEventOfSlice(viewport, {
          imageId: undefined,
          imageIdIndex: undefined,
        })
      );
      expect(events.volume).toEqual(
        volumeEventOfSlice(viewport, imageIdIndex, viewport.getNumberOfSlices())
      );
    });

    it(`fires the new image events once for the source when a second volume is mounted over it ${path}`, async function () {
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
      expect(events.stack).toEqual(
        stackEventOfSlice(viewport, { imageId, imageIdIndex })
      );
      expect(events.volume).toEqual(
        volumeEventOfSlice(viewport, imageIdIndex, series.size.slices)
      );

      events.stack.length = 0;
      events.volume.length = 0;
      await viewport.scroll(1);
      await firstRenderDone(viewport);

      expect(events.stack).toEqual(
        stackEventOfSlice(viewport, {
          imageId: viewport.getCurrentImageId(),
          imageIdIndex: imageIdIndex + 1,
        })
      );
      expect(events.volume).toEqual(
        volumeEventOfSlice(viewport, imageIdIndex + 1, series.size.slices)
      );
    });
  }

  for (const [path, pathOptions, renderMode] of STACK_PATHS) {
    for (const first of [0, 5]) {
      it(`fires STACK_NEW_IMAGE once and no VOLUME_NEW_IMAGE for the mount of a stack at its image ${first} ${path}`, async function () {
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
        expect(events.stack).toEqual([
          {
            image: jasmine.objectContaining({
              imageId: series.imageIds[first],
            }),
            imageId: series.imageIds[first],
            imageIdIndex: first,
            viewportId: viewport.id,
            renderingEngineId,
          },
        ]);
        expect(events.volume).toEqual([]);
      });
    }
  }

  /**
   * What the legacy viewports and their adapters fire for the same series.
   * A legacy volume viewport fires VOLUME_NEW_IMAGE once and no
   * STACK_NEW_IMAGE. Its adapter fires both twice: first as the volume is
   * attached, for the index of its middle image, then for the slice that the
   * mount shows. The legacy stack viewport and its adapter fire
   * STACK_NEW_IMAGE once.
   */
  it('keeps what the legacy adapters fire at a mount, beside the legacy volume viewport and the legacy stack viewport', async function () {
    const series = await createSeries({ id: 'mount-legacy' });
    const fired = {};

    for (const [id, type, adapter] of [
      ['legacyVolume', ViewportType.ORTHOGRAPHIC, false],
      ['adapterVolume', ViewportType.ORTHOGRAPHIC, true],
      ['legacyStack', ViewportType.STACK, false],
      ['adapterStack', ViewportType.STACK, true],
    ]) {
      const viewport = createLegacyViewport(renderingEngine, id, type, {
        adapter,
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
        sliceIndex: viewport.getCurrentImageIdIndex(),
        imageOnDisplay: series.imageIds.indexOf(viewport.getCurrentImageId()),
      };
    }

    expect(fired.legacyVolume).toEqual({
      stack: [],
      volume: [{ imageIndex: 3, numberOfSlices: 8 }],
      sliceIndex: 3,
      imageOnDisplay: 4,
    });
    expect(fired.adapterVolume).toEqual({
      stack: [
        { image: 4, imageIdIndex: 4 },
        { image: 3, imageIdIndex: 3 },
      ],
      volume: [
        { imageIndex: 4, numberOfSlices: 8 },
        { imageIndex: 3, numberOfSlices: 8 },
      ],
      sliceIndex: 3,
      imageOnDisplay: 4,
    });
    expect(fired.legacyStack).toEqual({
      stack: [{ image: 0, imageIdIndex: 0 }],
      volume: [],
      sliceIndex: 0,
      imageOnDisplay: 0,
    });
    expect(fired.adapterStack).toEqual(fired.legacyStack);
  });
});
