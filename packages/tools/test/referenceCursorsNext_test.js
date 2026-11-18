import * as cornerstone3D from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { utilities, Enums, volumeLoader, metaData } = cornerstone3D;
const { ViewportType } = Enums;
const { ReferenceCursors } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'referenceCursorsNext';
const tiltedVolumeId = 'referenceCursorsTilted';
const axialVolumeId = 'referenceCursorsAxial';
const stackIds = ['referenceCursorsStack1', 'referenceCursorsStack2'];
const syncedIds = [axialVolumeId, ...stackIds];
const FRAME_OF_REFERENCE_UID = 'Volume_Frame_Of_Reference';
const STACK_DEPTHS = [2, 6];
const TILTED_NORMAL = vec3.normalize(vec3.create(), [0, 0.5, -1]);
const TILTED_VIEW_UP = vec3.normalize(vec3.create(), [0, 1, 0.5]);
const FIRST_WINDOW_MS = 300;
const SECOND_WINDOW_MS = 600;

/**
 * Gives the images of the two stacks the frame of reference of the fake
 * volume, as the images of one series have, so that the cursor of one
 * viewport is drawn in the others.
 */
function stackFrameOfReferenceProvider(type, imageId) {
  if (type !== 'imagePlaneModule' || !imageId?.includes('referenceCursors')) {
    return;
  }

  return {
    ...testUtils.fakeMetaDataProvider(type, imageId),
    frameOfReferenceUID: FRAME_OF_REFERENCE_UID,
  };
}

/** Two images of 64 by 64 pixels of 1 mm, at the depths of `STACK_DEPTHS`. */
function createStackImageIds() {
  return STACK_DEPTHS.map((depth) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'referenceCursors',
      rows: 64,
      columns: 64,
      barStart: 10,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      ipp: [0, 0, depth],
    })
  );
}

/** A volume of 64 by 64 voxels of 1 mm and 10 slices, from depth 0 to 9. */
async function createVolume() {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURI',
    rows: 64,
    columns: 64,
    slices: 10,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  return volumeId;
}

/**
 * The scene of the example `referenceCursors` on direct next planar
 * viewports: a volume tilted about the left to right axis, where the mouse
 * moves, a volume in the axial plane, and two stacks of two axial images. The
 * stacks show their first image.
 */
async function createScene(
  renderingEngine,
  stackViewportType = ViewportType.PLANAR_NEXT
) {
  testUtils.createViewports(renderingEngine, [
    { viewportType: ViewportType.PLANAR_NEXT, viewportId: tiltedVolumeId },
    { viewportType: ViewportType.PLANAR_NEXT, viewportId: axialVolumeId },
    ...stackIds.map((viewportId) => ({
      viewportType: stackViewportType,
      viewportId,
    })),
  ]);

  const toolGroup = csTools3d.ToolGroupManager.getToolGroup(toolGroupId);

  [tiltedVolumeId, ...syncedIds].forEach((viewportId) =>
    toolGroup.addViewport(viewportId, renderingEngineId)
  );

  const volumeId = await createVolume();
  const tilted = renderingEngine.getViewport(tiltedVolumeId);

  await testUtils.setVolumesOnNextViewport(tilted, [volumeId]);
  await testUtils.setVolumesOnNextViewport(
    renderingEngine.getViewport(axialVolumeId),
    [volumeId]
  );
  await Promise.all(
    stackIds.map((viewportId) => {
      const viewport = renderingEngine.getViewport(viewportId);
      const imageIds = createStackImageIds();

      return stackViewportType === ViewportType.STACK
        ? viewport.setStack(imageIds, 0)
        : testUtils.setStackOnNextViewport(viewport, imageIds, 0);
    })
  );

  tilted.setViewState({
    orientation: {
      viewPlaneNormal: [...TILTED_NORMAL],
      viewUp: [...TILTED_VIEW_UP],
    },
  });
  renderingEngine.render();
  await wait(FIRST_WINDOW_MS);

  return tilted;
}

/** Resolves after a number of milliseconds. */
function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * The canvas point on the vertical centre line of the tilted viewport whose
 * world point lies at a depth (the world z).
 */
function canvasPointAtDepth(viewport, depth) {
  const top = viewport.canvasToWorld([200, 0]);
  const bottom = viewport.canvasToWorld([200, 400]);
  const y = Math.round(((depth - top[2]) / (bottom[2] - top[2])) * 400);

  expect(y).toBeGreaterThan(0);
  expect(y).toBeLessThan(400);

  return [200, y];
}

/** Moves the mouse onto a canvas point of the element, in one move. */
function moveMouseTo(element, canvasPoint) {
  const rect = element.getBoundingClientRect();
  const clientX = Math.round(rect.left + canvasPoint[0]);
  const clientY = Math.round(rect.top + canvasPoint[1]);

  element.dispatchEvent(
    new MouseEvent('mousemove', {
      clientX,
      clientY,
      pageX: clientX + window.pageXOffset,
      pageY: clientY + window.pageYOffset,
    })
  );
}

/**
 * Counts the renders of each synced viewport over two windows of time after
 * one move of the mouse on the tilted viewport.
 */
async function countRendersAfterOneMove(renderingEngine, canvasPoint) {
  const counts = {};
  const listeners = syncedIds.map((viewportId) => {
    const { element } = renderingEngine.getViewport(viewportId);
    const listener = () => {
      counts[viewportId] += 1;
    };

    counts[viewportId] = 0;
    element.addEventListener(Enums.Events.IMAGE_RENDERED, listener);

    return () =>
      element.removeEventListener(Enums.Events.IMAGE_RENDERED, listener);
  });

  moveMouseTo(renderingEngine.getViewport(tiltedVolumeId).element, canvasPoint);
  await wait(FIRST_WINDOW_MS);

  const first = { ...counts };

  await wait(SECOND_WINDOW_MS);
  listeners.forEach((removeListener) => removeListener());

  const second = {};

  syncedIds.forEach((viewportId) => {
    second[viewportId] = counts[viewportId] - first[viewportId];
  });

  return { first, second };
}

/**
 * Checks that the renders of every synced viewport stopped within the first
 * window after the move: a few renders in the first, none in the second.
 */
function expectRendersToSettle({ first, second }) {
  syncedIds.forEach((viewportId) => {
    expect(second[viewportId])
      .withContext(`renders of ${viewportId} in the second window`)
      .toBe(0);
    expect(first[viewportId])
      .withContext(`renders of ${viewportId} in the first window`)
      .toBeLessThanOrEqual(3);
  });
}

/** The depth (world z) of the slice that a synced viewport shows. */
function depthOnDisplay(renderingEngine, viewportId) {
  return renderingEngine.getViewport(viewportId).canvasToWorld([200, 200])[2];
}

describe('ReferenceCursors on direct next viewports -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [ReferenceCursors],
      toolActivations: { [ReferenceCursors.toolName]: {} },
    }).renderingEngine;
    metaData.addProvider(stackFrameOfReferenceProvider, 20000);
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  it('stops rendering the other viewports after one move to a point between the two images, nearer to the one on display', async function () {
    const tilted = await createScene(renderingEngine);
    const renders = await countRendersAfterOneMove(
      renderingEngine,
      canvasPointAtDepth(tilted, 3.2)
    );

    expectRendersToSettle(renders);
    stackIds.forEach((viewportId) => {
      expect(
        renderingEngine.getViewport(viewportId).getCurrentImageIdIndex()
      ).toBe(0);
    });
    expect(depthOnDisplay(renderingEngine, axialVolumeId)).toBeCloseTo(3.2, 0);
  });

  it('stops rendering the other viewports after one move to a point past the last image and past the volume', async function () {
    const tilted = await createScene(renderingEngine);
    const renders = await countRendersAfterOneMove(
      renderingEngine,
      canvasPointAtDepth(tilted, 11.5)
    );

    expectRendersToSettle(renders);
    expect(depthOnDisplay(renderingEngine, axialVolumeId)).toBeCloseTo(9, 1);
  });

  it('moves the stacks to the image nearest to the cursor, and then stops rendering them', async function () {
    const tilted = await createScene(renderingEngine);
    const renders = await countRendersAfterOneMove(
      renderingEngine,
      canvasPointAtDepth(tilted, 5.2)
    );

    expectRendersToSettle(renders);
    stackIds.forEach((viewportId) => {
      expect(
        renderingEngine.getViewport(viewportId).getCurrentImageIdIndex()
      ).toBe(1);
      expect(depthOnDisplay(renderingEngine, viewportId)).toBeCloseTo(6, 3);
    });
  });

  it('stops rendering legacy adapters of a stack after one move, as direct next viewports', async function () {
    const tilted = await createScene(renderingEngine, ViewportType.STACK);
    const renders = await countRendersAfterOneMove(
      renderingEngine,
      canvasPointAtDepth(tilted, 3.2)
    );

    expectRendersToSettle(renders);
    stackIds.forEach((viewportId) => {
      expect(
        renderingEngine.getViewport(viewportId).getCurrentImageIdIndex()
      ).toBe(0);
    });
  });
});
