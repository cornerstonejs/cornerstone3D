import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities, cache, eventTarget } = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;

const renderingEngineId = utilities.uuidv4();

/** An orientation that is none of the three planes of the volume. */
const OBLIQUE = {
  viewPlaneNormal: [Math.SQRT1_2, 0, Math.SQRT1_2],
  viewUp: [0, -1, 0],
};

/** Makes a planar viewport of 400 by 300 pixels. */
function createViewport(renderingEngine, viewportId = 'scrollEvents') {
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

/**
 * Shows a stack of 10 images 1 mm apart along z on the viewport. Gives its
 * display set and its image ids.
 */
async function showStack(viewport, images = 10) {
  const displaySetId = `scrollEventsStack:${viewport.id}:${images}`;
  const imageIds = Array.from({ length: images }, (_, sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'imageURI',
      id: 'scrollEventsStack',
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
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { initialImageIdIndex: 0 },
  });
  await renderAndWait(viewport);

  return { displaySetId, imageIds };
}

/**
 * Shows a volume of 40 columns, 30 rows and a number of slices 1 mm apart in
 * an orientation. Gives its display set, the volume id and the image ids of
 * the volume.
 */
async function showVolume(viewport, orientation, slices = 12) {
  const displaySetId = `scrollEventsVolume:${viewport.id}:${slices}`;
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'scrollEventsVolume',
    id: `scrollEventsVolume${slices}`,
    rows: 30,
    columns: 40,
    slices,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  const { imageIds } = cache.getVolume(volumeId);

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { orientation, mode: 'volume' },
  });
  await renderAndWait(viewport);

  return { displaySetId, volumeId, imageIds };
}

/**
 * Listens to SCROLL_OUT_OF_BOUNDS on the element of the viewport and on the
 * eventTarget while `action` runs. Gives the details that each target got,
 * with the image id as its index in `imageIds` (`-1` for an image id of no
 * image, `undefined` for none).
 */
async function recordOutOfBounds(viewport, imageIds, action) {
  const onElement = [];
  const onEventTarget = [];
  const readable = (detail) => ({
    ...detail,
    imageId:
      detail.imageId === undefined
        ? undefined
        : imageIds.indexOf(detail.imageId),
  });
  const elementListener = (evt) => onElement.push(readable(evt.detail));
  const eventTargetListener = (evt) => onEventTarget.push(readable(evt.detail));

  viewport.element.addEventListener(
    Events.SCROLL_OUT_OF_BOUNDS,
    elementListener
  );
  eventTarget.addEventListener(
    Events.SCROLL_OUT_OF_BOUNDS,
    eventTargetListener
  );

  try {
    await action();
  } finally {
    viewport.element.removeEventListener(
      Events.SCROLL_OUT_OF_BOUNDS,
      elementListener
    );
    eventTarget.removeEventListener(
      Events.SCROLL_OUT_OF_BOUNDS,
      eventTargetListener
    );
  }

  return { onElement, onEventTarget };
}

/**
 * Scrolls once with the options and gives the details of that scroll. Each
 * detail must have come once on the element and once on the eventTarget.
 */
async function scrollAndRecord(viewport, imageIds, options) {
  const { onElement, onEventTarget } = await recordOutOfBounds(
    viewport,
    imageIds,
    () => utilities.scroll(viewport, options)
  );

  expect(onEventTarget).toEqual(onElement);

  return onElement;
}

/** The keys of the detail that name the viewport and its source. */
function sourceOf(viewport, displaySetId) {
  return {
    viewportId: viewport.id,
    renderingEngineId,
    displaySetId,
  };
}

/**
 * Scrolls past the last and the first position of a viewport, each from
 * one step inside, and gives the details of the four scrolls: one inside
 * and one past the end, at each end.
 */
async function scrollPastBothEnds(viewport, imageIds, numberOfSlices) {
  await utilities.jumpToSlice(viewport.element, {
    imageIndex: numberOfSlices - 2,
  });

  const towardLast = [];

  for (const delta of [1, 1]) {
    towardLast.push(await scrollAndRecord(viewport, imageIds, { delta }));
  }

  const lastIndex = viewport.getCurrentImageIdIndex();

  await utilities.jumpToSlice(viewport.element, { imageIndex: 1 });

  const towardFirst = [];

  for (const delta of [-1, -3]) {
    towardFirst.push(await scrollAndRecord(viewport, imageIds, { delta }));
  }

  return {
    towardLast,
    towardFirst,
    lastIndex,
    firstIndex: viewport.getCurrentImageIdIndex(),
  };
}

/**
 * The 6.0.0-beta.2 events, measured on 551f61fe2 with the same scrolls:
 * `utilities.scroll` fired STACK_SCROLL_OUT_OF_BOUNDS on the eventTarget in
 * stack mode only, before the scroll and with `loop` too, with
 * `{ imageIdIndex, direction }`; in volume mode it fired
 * VOLUME_VIEWPORT_SCROLL after each scroll, and
 * VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS in its place past an end in the
 * acquisition plane only (a sagittal or an oblique view fired
 * VOLUME_VIEWPORT_SCROLL past an end); a volume of one slice fired nothing;
 * `viewport.scroll` fired nothing. 6.0 fires one event, SCROLL_OUT_OF_BOUNDS,
 * on the element and on the eventTarget, in every mode and orientation,
 * when a scroll without `loop` stops at an end, from both entry points.
 */
describe('SCROLL_OUT_OF_BOUNDS of a planar viewport -- ', () => {
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

  it('fires once on the element and once on the eventTarget when a stack scroll stops at the last and at the first image', async function () {
    const viewport = createViewport(renderingEngine);
    const { displaySetId, imageIds } = await showStack(viewport);
    const { towardLast, towardFirst, lastIndex, firstIndex } =
      await scrollPastBothEnds(viewport, imageIds, 10);

    expect(viewport.getCurrentMode()).toBe('stack');
    expect([lastIndex, firstIndex]).toEqual([9, 0]);
    expect(towardLast).toEqual([
      [],
      [
        {
          ...sourceOf(viewport, displaySetId),
          volumeId: undefined,
          sliceIndex: 9,
          numberOfSlices: 10,
          delta: 1,
          direction: 1,
          imageId: 9,
        },
      ],
    ]);
    expect(towardFirst).toEqual([
      [],
      [
        {
          ...sourceOf(viewport, displaySetId),
          volumeId: undefined,
          sliceIndex: 0,
          numberOfSlices: 10,
          delta: -3,
          direction: -1,
          imageId: 0,
        },
      ],
    ]);
  });

  it('gives the position the scroll stopped at for a scroll from the middle past an end', async function () {
    const viewport = createViewport(renderingEngine);
    const { imageIds } = await showStack(viewport);

    await utilities.jumpToSlice(viewport.element, { imageIndex: 4 });

    const past = await scrollAndRecord(viewport, imageIds, { delta: 40 });

    expect(viewport.getCurrentImageIdIndex()).toBe(9);
    expect(
      past.map(({ sliceIndex, delta, direction }) => [
        sliceIndex,
        delta,
        direction,
      ])
    ).toEqual([[9, 40, 1]]);
  });

  it('fires at both ends of an axial volume, with the volume and the image on display', async function () {
    const viewport = createViewport(renderingEngine);
    const { displaySetId, volumeId, imageIds } = await showVolume(
      viewport,
      OrientationAxis.AXIAL
    );
    const { towardLast, towardFirst, lastIndex, firstIndex } =
      await scrollPastBothEnds(viewport, imageIds, 12);

    expect(viewport.getCurrentMode()).toBe('volume');
    expect([lastIndex, firstIndex]).toEqual([11, 0]);
    expect(towardLast).toEqual([
      [],
      [
        {
          ...sourceOf(viewport, displaySetId),
          volumeId,
          sliceIndex: 11,
          numberOfSlices: 12,
          delta: 1,
          direction: 1,
          imageId: 0,
        },
      ],
    ]);
    expect(towardFirst).toEqual([
      [],
      [
        {
          ...sourceOf(viewport, displaySetId),
          volumeId,
          sliceIndex: 0,
          numberOfSlices: 12,
          delta: -3,
          direction: -1,
          imageId: 11,
        },
      ],
    ]);
  });

  it('fires at both ends of a sagittal volume, out of the acquisition plane, with no image id', async function () {
    const viewport = createViewport(renderingEngine);
    const { displaySetId, volumeId, imageIds } = await showVolume(
      viewport,
      OrientationAxis.SAGITTAL
    );
    const numberOfSlices = viewport.getNumberOfSlices();
    const { towardLast, towardFirst, lastIndex, firstIndex } =
      await scrollPastBothEnds(viewport, imageIds, numberOfSlices);

    expect(numberOfSlices).toBe(30);
    expect(utilities.isInAcquisitionPlane(viewport)).toBe(false);
    expect([lastIndex, firstIndex]).toEqual([29, 0]);
    expect(towardLast).toEqual([
      [],
      [
        {
          ...sourceOf(viewport, displaySetId),
          volumeId,
          sliceIndex: 29,
          numberOfSlices,
          delta: 1,
          direction: 1,
          imageId: undefined,
        },
      ],
    ]);
    expect(towardFirst).toEqual([
      [],
      [
        {
          ...sourceOf(viewport, displaySetId),
          volumeId,
          sliceIndex: 0,
          numberOfSlices,
          delta: -3,
          direction: -1,
          imageId: undefined,
        },
      ],
    ]);
  });

  it('fires at both ends of an oblique volume slice', async function () {
    const viewport = createViewport(renderingEngine);
    const { displaySetId, volumeId, imageIds } = await showVolume(
      viewport,
      OBLIQUE
    );
    const numberOfSlices = viewport.getNumberOfSlices();
    const { towardLast, towardFirst, lastIndex, firstIndex } =
      await scrollPastBothEnds(viewport, imageIds, numberOfSlices);

    expect(numberOfSlices).toBeGreaterThan(2);
    expect(utilities.isInAcquisitionPlane(viewport)).toBe(false);
    expect([lastIndex, firstIndex]).toEqual([numberOfSlices - 1, 0]);
    expect(towardLast.map((details) => details.length)).toEqual([0, 1]);
    expect(towardFirst.map((details) => details.length)).toEqual([0, 1]);
    expect(towardLast[1][0]).toEqual({
      ...sourceOf(viewport, displaySetId),
      volumeId,
      sliceIndex: numberOfSlices - 1,
      numberOfSlices,
      delta: 1,
      direction: 1,
      imageId: undefined,
    });
    expect(towardFirst[1][0]).toEqual({
      ...sourceOf(viewport, displaySetId),
      volumeId,
      sliceIndex: 0,
      numberOfSlices,
      delta: -3,
      direction: -1,
      imageId: undefined,
    });
  });

  it('counts the slab steps of a slab scroll and fires at both ends of them', async function () {
    const viewport = createViewport(renderingEngine);
    const { displaySetId, volumeId, imageIds } = await showVolume(
      viewport,
      OrientationAxis.AXIAL
    );

    viewport.setDisplaySetAppearance(displaySetId, { slabThickness: 3 });
    await renderAndWait(viewport);
    await utilities.jumpToSlice(viewport.element, { imageIndex: 0 });

    const forward = [];
    const sliceIndices = [];

    for (const delta of [1, 1, 1, 1, 1]) {
      forward.push(
        await scrollAndRecord(viewport, imageIds, { delta, scrollSlabs: true })
      );
      sliceIndices.push(viewport.getCurrentImageIdIndex());
    }

    const back = await scrollAndRecord(viewport, imageIds, {
      delta: -9,
      scrollSlabs: true,
    });

    expect(sliceIndices).toEqual([3, 6, 8, 11, 11]);
    expect(forward.slice(0, 4)).toEqual([[], [], [], []]);
    expect(forward[4]).toEqual([
      {
        ...sourceOf(viewport, displaySetId),
        volumeId,
        sliceIndex: 4,
        numberOfSlices: 5,
        delta: 1,
        direction: 1,
        imageId: 0,
      },
    ]);
    expect(viewport.getCurrentImageIdIndex()).toBe(0);
    expect(back).toEqual([
      {
        ...sourceOf(viewport, displaySetId),
        volumeId,
        sliceIndex: 0,
        numberOfSlices: 5,
        delta: -9,
        direction: -1,
        imageId: 11,
      },
    ]);
  });

  it('fires nothing for a scroll inside the range and nothing with loop, in both modes', async function () {
    const stackViewport = createViewport(renderingEngine, 'scrollEventsStack');
    const volumeViewport = createViewport(
      renderingEngine,
      'scrollEventsVolume'
    );
    const stack = await showStack(stackViewport);
    const volume = await showVolume(volumeViewport, OrientationAxis.SAGITTAL);
    const results = [];

    for (const [viewport, { imageIds }] of [
      [stackViewport, stack],
      [volumeViewport, volume],
    ]) {
      const last = viewport.getNumberOfSlices() - 1;

      await utilities.jumpToSlice(viewport.element, { imageIndex: 3 });

      const inside = await scrollAndRecord(viewport, imageIds, { delta: 2 });

      await utilities.jumpToSlice(viewport.element, { imageIndex: last });

      const wrappedForward = await scrollAndRecord(viewport, imageIds, {
        delta: 1,
        loop: true,
      });
      const afterForward = viewport.getCurrentImageIdIndex();
      const wrappedBack = await scrollAndRecord(viewport, imageIds, {
        delta: -2,
        loop: true,
      });

      results.push([
        inside,
        wrappedForward,
        afterForward,
        wrappedBack,
        viewport.getCurrentImageIdIndex() === last - 1,
      ]);
    }

    expect(results).toEqual([
      [[], [], 0, [], true],
      [[], [], 0, [], true],
    ]);
  });

  it('gives the same position and the same event for viewport.scroll and utilities.scroll', async function () {
    const viewport = createViewport(renderingEngine);
    const outcomes = { viewport: [], utilities: [] };
    const requests = [
      { delta: 1 },
      { delta: 40 },
      { delta: -2, loop: true },
      { delta: -40 },
      { delta: 1, scrollSlabs: true },
      { delta: 90, scrollSlabs: true },
    ];

    for (const show of [
      () => showStack(viewport),
      () => showVolume(viewport, OrientationAxis.SAGITTAL),
      async () => {
        const shown = await showVolume(viewport, OrientationAxis.AXIAL);

        viewport.setDisplaySetAppearance(shown.displaySetId, {
          slabThickness: 3,
        });
        await renderAndWait(viewport);

        return shown;
      },
    ]) {
      const { imageIds } = await show();

      for (const [name, run] of [
        [
          'viewport',
          ({ delta, ...options }) => viewport.scroll(delta, options),
        ],
        ['utilities', (options) => utilities.scroll(viewport, options)],
      ]) {
        await utilities.jumpToSlice(viewport.element, { imageIndex: 2 });

        for (const request of requests) {
          const { onElement, onEventTarget } = await recordOutOfBounds(
            viewport,
            imageIds,
            () => run(request)
          );

          outcomes[name].push({
            index: viewport.getCurrentImageIdIndex(),
            onElement,
            onEventTarget,
          });
        }
      }
    }

    expect(outcomes.viewport).toEqual(outcomes.utilities);
    expect(outcomes.utilities.map(({ onElement }) => onElement.length)).toEqual(
      [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]
    );
  });

  it('fires on each scroll of a volume of one slice', async function () {
    const viewport = createViewport(renderingEngine);
    const { displaySetId, volumeId, imageIds } = await showVolume(
      viewport,
      OrientationAxis.AXIAL,
      1
    );

    const forward = await scrollAndRecord(viewport, imageIds, { delta: 1 });
    const back = await scrollAndRecord(viewport, imageIds, { delta: -1 });
    const looped = await scrollAndRecord(viewport, imageIds, {
      delta: 1,
      loop: true,
    });

    expect(viewport.getCurrentMode()).toBe('volume');
    expect(forward).toEqual([
      {
        ...sourceOf(viewport, displaySetId),
        volumeId,
        sliceIndex: 0,
        numberOfSlices: 1,
        delta: 1,
        direction: 1,
        imageId: 0,
      },
    ]);
    expect(back.map(({ direction }) => direction)).toEqual([-1]);
    expect(looped).toEqual([]);
  });

  it('fires nothing for a jump to a slice, which never asks past an end', async function () {
    const viewport = createViewport(renderingEngine);
    const { imageIds } = await showVolume(viewport, OrientationAxis.AXIAL);

    const { onElement, onEventTarget } = await recordOutOfBounds(
      viewport,
      imageIds,
      async () => {
        await utilities.jumpToSlice(viewport.element, { imageIndex: 40 });
        await utilities.jumpToSlice(viewport.element, { imageIndex: -4 });
      }
    );

    expect(viewport.getCurrentImageIdIndex()).toBe(0);
    expect([onElement, onEventTarget]).toEqual([[], []]);
  });
});
