import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities, cache, eventTarget } = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;

const renderingEngineId = utilities.uuidv4();

const SCROLL_EVENTS = [
  Events.STACK_SCROLL_OUT_OF_BOUNDS,
  Events.VOLUME_VIEWPORT_SCROLL,
  Events.VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS,
];

/** Makes a planar viewport of 400 by 300 pixels. */
function createViewport(renderingEngine) {
  testUtils.createViewports(renderingEngine, {
    viewportId: 'scrollEvents',
    viewportType: ViewportType.PLANAR,
    orientation: OrientationAxis.ACQUISITION,
    width: 400,
    height: 300,
    useEnableElement: true,
  });

  return renderingEngine.getViewport('scrollEvents');
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
  const displaySetId = `scrollEventsStack:${viewport.id}`;
  const imageIds = Array.from({ length: 10 }, (_, sliceIndex) =>
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
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({ displaySetId });
  await renderAndWait(viewport);
}

/**
 * Shows a volume of 40 columns, 30 rows and a number of slices 1 mm apart in
 * an orientation. Gives the volume id and the image ids of the volume.
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
  await viewport.setDisplaySets({ displaySetId, options: { orientation } });
  await renderAndWait(viewport);

  return { volumeId, imageIds };
}

/**
 * Listens to the three scroll events while `action` runs and gives each
 * event with its detail. The viewport of a detail becomes `true` when it is
 * the viewport of the test, and the image id becomes its index in `imageIds`
 * (`-1` for an image id of no image, `undefined` for none).
 */
async function recordScrollEvents(viewport, imageIds, action) {
  const seen = [];
  const listener = (evt) => {
    const { viewport: eventViewport, currentImageId, ...rest } = evt.detail;
    const entry = { event: evt.type, ...rest };

    if (evt.type !== Events.STACK_SCROLL_OUT_OF_BOUNDS) {
      entry.viewport = eventViewport === viewport;
      entry.currentImageId =
        currentImageId === undefined
          ? undefined
          : imageIds.indexOf(currentImageId);
    }

    seen.push(entry);
  };

  SCROLL_EVENTS.forEach((name) => eventTarget.addEventListener(name, listener));

  try {
    await action();
  } finally {
    SCROLL_EVENTS.forEach((name) =>
      eventTarget.removeEventListener(name, listener)
    );
  }

  return seen;
}

/** Scrolls once with the options and gives the events of that scroll. */
function scrollAndRecord(viewport, imageIds, options) {
  return recordScrollEvents(viewport, imageIds, () =>
    utilities.scroll(viewport, options)
  );
}

/**
 * The legacy behaviour was measured on commit 58914567b with the same scrolls
 * on a legacy volume viewport (`ViewportType.ORTHOGRAPHIC`) and a legacy stack
 * viewport (`ViewportType.STACK`) with the same data:
 * - a volume viewport fired one VOLUME_VIEWPORT_SCROLL on every scroll, and
 *   VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS in its place when the scroll asked to
 *   go past an end while the view was in the acquisition plane; out of that
 *   plane a scroll past an end fired VOLUME_VIEWPORT_SCROLL. It never fired
 *   STACK_SCROLL_OUT_OF_BOUNDS. A volume of one slice fired nothing;
 * - the detail was `{ volumeId, viewport, delta, desiredStepIndex,
 *   currentStepIndex, numScrollSteps, currentImageId }`: the `volumeId` of the
 *   options (undefined without one), the asked delta, the step before the
 *   scroll plus the delta, the step before the scroll, the number of steps
 *   (slices less one) and the image id shown after the scroll (undefined out
 *   of the acquisition plane);
 * - `utilities.jumpToSlice` scrolls, so it fired VOLUME_VIEWPORT_SCROLL too;
 * - a stack viewport fired only STACK_SCROLL_OUT_OF_BOUNDS, with
 *   `{ imageIdIndex, direction }`, when a scroll asked to go past an end.
 *
 * One value differs on purpose: without a `volumeId` in the options, the
 * detail gives the volume that the viewport shows, where the legacy detail
 * gave undefined, so that its type can keep `volumeId` a string.
 */
describe('Scroll events of a planar viewport -- ', () => {
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

  it('fires VOLUME_VIEWPORT_SCROLL inside the volume and VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS past an end in the acquisition plane', async function () {
    const viewport = createViewport(renderingEngine);
    const { volumeId, imageIds } = await showVolume(
      viewport,
      OrientationAxis.AXIAL
    );

    await utilities.jumpToSlice(viewport.element, { imageIndex: 3 });

    const events = [];

    for (const delta of [2, -1, 40, -40]) {
      events.push(await scrollAndRecord(viewport, imageIds, { delta }));
    }

    await renderAndWait(viewport);

    expect(viewport.getCurrentMode()).toBe('volume');
    expect(events).toEqual([
      [
        {
          event: Events.VOLUME_VIEWPORT_SCROLL,
          volumeId,
          viewport: true,
          delta: 2,
          desiredStepIndex: 5,
          currentStepIndex: 3,
          numScrollSteps: 11,
          currentImageId: 6,
        },
      ],
      [
        {
          event: Events.VOLUME_VIEWPORT_SCROLL,
          volumeId,
          viewport: true,
          delta: -1,
          desiredStepIndex: 4,
          currentStepIndex: 5,
          numScrollSteps: 11,
          currentImageId: 7,
        },
      ],
      [
        {
          event: Events.VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS,
          volumeId,
          viewport: true,
          delta: 40,
          desiredStepIndex: 44,
          currentStepIndex: 4,
          numScrollSteps: 11,
          currentImageId: 0,
        },
      ],
      [
        {
          event: Events.VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS,
          volumeId,
          viewport: true,
          delta: -40,
          desiredStepIndex: -29,
          currentStepIndex: 11,
          numScrollSteps: 11,
          currentImageId: 11,
        },
      ],
    ]);
  });

  it('gives the volumeId of the options in the detail', async function () {
    const viewport = createViewport(renderingEngine);
    const { volumeId, imageIds } = await showVolume(
      viewport,
      OrientationAxis.AXIAL
    );

    await utilities.jumpToSlice(viewport.element, { imageIndex: 0 });

    const inside = await scrollAndRecord(viewport, imageIds, {
      delta: 1,
      volumeId,
    });
    const past = await scrollAndRecord(viewport, imageIds, {
      delta: 40,
      volumeId,
    });

    expect(inside).toEqual([
      {
        event: Events.VOLUME_VIEWPORT_SCROLL,
        volumeId,
        viewport: true,
        delta: 1,
        desiredStepIndex: 1,
        currentStepIndex: 0,
        numScrollSteps: 11,
        currentImageId: 10,
      },
    ]);
    expect(past).toEqual([
      {
        event: Events.VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS,
        volumeId,
        viewport: true,
        delta: 40,
        desiredStepIndex: 41,
        currentStepIndex: 1,
        numScrollSteps: 11,
        currentImageId: 0,
      },
    ]);
  });

  it('gives the volumeId of the mounted volume in the detail when the options give none', async function () {
    const viewport = createViewport(renderingEngine);
    const { volumeId, imageIds } = await showVolume(
      viewport,
      OrientationAxis.AXIAL
    );

    await utilities.jumpToSlice(viewport.element, { imageIndex: 10 });

    const inside = await scrollAndRecord(viewport, imageIds, { delta: 1 });
    const past = await scrollAndRecord(viewport, imageIds, { delta: 1 });

    expect(inside.map(({ event, volumeId: id }) => [event, id])).toEqual([
      [Events.VOLUME_VIEWPORT_SCROLL, volumeId],
    ]);
    expect(past.map(({ event, volumeId: id }) => [event, id])).toEqual([
      [Events.VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS, volumeId],
    ]);
  });

  it('fires VOLUME_VIEWPORT_SCROLL past an end out of the acquisition plane, with no image id', async function () {
    const viewport = createViewport(renderingEngine);
    const { volumeId, imageIds } = await showVolume(
      viewport,
      OrientationAxis.SAGITTAL
    );
    const numScrollSteps = viewport.getNumberOfSlices() - 1;

    await utilities.jumpToSlice(viewport.element, { imageIndex: 3 });

    const inside = await scrollAndRecord(viewport, imageIds, { delta: 2 });
    const past = await scrollAndRecord(viewport, imageIds, { delta: 40 });

    expect(numScrollSteps).toBe(29);
    expect(inside).toEqual([
      {
        event: Events.VOLUME_VIEWPORT_SCROLL,
        volumeId,
        viewport: true,
        delta: 2,
        desiredStepIndex: 5,
        currentStepIndex: 3,
        numScrollSteps,
        currentImageId: undefined,
      },
    ]);
    expect(past).toEqual([
      {
        event: Events.VOLUME_VIEWPORT_SCROLL,
        volumeId,
        viewport: true,
        delta: 40,
        desiredStepIndex: 45,
        currentStepIndex: 5,
        numScrollSteps,
        currentImageId: undefined,
      },
    ]);
  });

  it('fires VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS when a loop wraps past an end in volume mode', async function () {
    const viewport = createViewport(renderingEngine);
    const { volumeId, imageIds } = await showVolume(
      viewport,
      OrientationAxis.AXIAL
    );

    await utilities.jumpToSlice(viewport.element, { imageIndex: 11 });

    const wrapped = await scrollAndRecord(viewport, imageIds, {
      delta: 1,
      loop: true,
    });

    expect(viewport.getCurrentImageIdIndex()).toBe(0);
    expect(wrapped).toEqual([
      {
        event: Events.VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS,
        volumeId,
        viewport: true,
        delta: 1,
        desiredStepIndex: 12,
        currentStepIndex: 11,
        numScrollSteps: 11,
        currentImageId: 11,
      },
    ]);
  });

  it('fires VOLUME_VIEWPORT_SCROLL on a jump to a slice in volume mode', async function () {
    const viewport = createViewport(renderingEngine);
    const { volumeId, imageIds } = await showVolume(
      viewport,
      OrientationAxis.AXIAL
    );

    await utilities.jumpToSlice(viewport.element, { imageIndex: 10 });

    const jumped = await recordScrollEvents(viewport, imageIds, () =>
      utilities.jumpToSlice(viewport.element, { imageIndex: 5 })
    );

    expect(jumped).toEqual([
      {
        event: Events.VOLUME_VIEWPORT_SCROLL,
        volumeId,
        viewport: true,
        delta: -5,
        desiredStepIndex: 5,
        currentStepIndex: 10,
        numScrollSteps: 11,
        currentImageId: 6,
      },
    ]);
  });

  it('fires no scroll event on a volume of one slice', async function () {
    const viewport = createViewport(renderingEngine);
    const { imageIds } = await showVolume(viewport, OrientationAxis.AXIAL, 1);

    const events = await scrollAndRecord(viewport, imageIds, { delta: 1 });

    expect(viewport.getCurrentMode()).toBe('volume');
    expect(events).toEqual([]);
  });

  it('fires only STACK_SCROLL_OUT_OF_BOUNDS in stack mode, past an end', async function () {
    const viewport = createViewport(renderingEngine);

    await showStack(viewport);
    await utilities.jumpToSlice(viewport.element, { imageIndex: 3 });

    const events = [];

    for (const delta of [2, -1, 40, -40]) {
      events.push(await scrollAndRecord(viewport, [], { delta }));
    }

    expect(viewport.getCurrentMode()).toBe('stack');
    expect(events).toEqual([
      [],
      [],
      [
        {
          event: Events.STACK_SCROLL_OUT_OF_BOUNDS,
          imageIdIndex: 4,
          direction: 40,
        },
      ],
      [
        {
          event: Events.STACK_SCROLL_OUT_OF_BOUNDS,
          imageIdIndex: 9,
          direction: -40,
        },
      ],
    ]);
  });
});
