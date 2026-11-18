import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { createNextPlanarViewport } from './nextLabelmapScenes';

const { utilities, volumeLoader } = cornerstone3D;
const {
  RectangleROIThresholdTool,
  annotation,
  Enums: csToolsEnums,
} = csTools3d;
const { Events: csToolsEvents } = csToolsEnums;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'rectangleROIThresholdNext';
const viewportId = 'rectangleROIThresholdNext';

/**
 * Drags the first mouse button from the voxel of one index to the voxel of
 * another: the press, and when the tools have handled it the move and the
 * release. It resolves when the tools have handled the release.
 * @returns The world points of the press and of the release.
 */
function dragBetweenIndices(viewport, imageData, startIndex, endIndex) {
  const { element } = viewport;
  const start = testUtils.createNormalizedMouseEvent(
    imageData,
    startIndex,
    element,
    viewport
  );
  const end = testUtils.createNormalizedMouseEvent(
    imageData,
    endIndex,
    element,
    viewport
  );
  const released = new Promise((resolve) => {
    element.addEventListener(csToolsEvents.MOUSE_UP, resolve, { once: true });
  });

  element.addEventListener(
    csToolsEvents.MOUSE_DOWN_ACTIVATE,
    () => {
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          target: element,
          buttons: 1,
          clientX: end.clientX,
          clientY: end.clientY,
          pageX: end.pageX,
          pageY: end.pageY,
        })
      );
      document.dispatchEvent(new MouseEvent('mouseup'));
    },
    { once: true }
  );
  element.dispatchEvent(
    new MouseEvent('mousedown', {
      target: element,
      buttons: 1,
      clientX: start.clientX,
      clientY: start.clientY,
      pageX: start.pageX,
      pageY: start.pageY,
    })
  );

  return released.then(() => [start.worldCoord, end.worldCoord]);
}

/** Checks that two world points are the same, to a thousandth of a mm. */
function expectPointsToBeClose(actual, expected) {
  expected.forEach((value, axis) => {
    expect(actual[axis]).toBeCloseTo(value, 3);
  });
}

/**
 * Checks that the tool has one annotation, whose rectangle goes from the
 * press to the release and whose view vectors are those of the viewport.
 * @returns The annotation.
 */
function expectRectangleBetween(viewport, startWorld, endWorld) {
  const annotations =
    annotation.state.getAnnotations(
      RectangleROIThresholdTool.toolName,
      viewport.element
    ) || [];

  expect(annotations.length).toBe(1);

  if (annotations.length !== 1) {
    return;
  }

  const { metadata, data } = annotations[0];
  const { viewPlaneNormal, viewUp } = viewport.getViewReference();

  expectPointsToBeClose(data.handles.points[0], startWorld);
  expectPointsToBeClose(data.handles.points[3], endWorld);
  expectPointsToBeClose(metadata.viewPlaneNormal, viewPlaneNormal);
  expectPointsToBeClose(metadata.viewUp, viewUp);
  expect(metadata.FrameOfReferenceUID).toBe(viewport.getFrameOfReferenceUID());

  return annotations[0];
}

describe('RectangleROIThresholdTool on a direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [RectangleROIThresholdTool],
      toolActivations: {
        [RectangleROIThresholdTool.toolName]: {
          bindings: [{ mouseButton: 1 }],
        },
      },
      viewportIds: [viewportId],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  it('draws a rectangle with a mouse drag on the volume of the viewport, in volume mode', async function () {
    const viewport = createNextPlanarViewport(renderingEngine, viewportId);
    const volumeId = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      name: 'volumeURI',
      rows: 100,
      columns: 100,
      slices: 4,
      xSpacing: 1,
      ySpacing: 1,
      zSpacing: 1,
    });

    await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
    await testUtils.setVolumesOnNextViewport(viewport, [volumeId]);
    expect(viewport.getCurrentMode()).toBe('volume');

    const { imageData } = viewport.getImageData();
    const slice = viewport.getSliceIndex();
    const [startWorld, endWorld] = await dragBetweenIndices(
      viewport,
      imageData,
      [50, 10, slice],
      [70, 30, slice]
    );
    const rectangle = expectRectangleBetween(viewport, startWorld, endWorld);

    expect(rectangle?.metadata.volumeId).toBe(volumeId);
  });

  it('draws a rectangle with a mouse drag on the image of the viewport, in stack mode', async function () {
    const viewport = createNextPlanarViewport(renderingEngine, viewportId);
    const imageIds = [0, 1, 2].map((sliceIndex) =>
      testUtils.encodeImageIdInfo({
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 64,
        columns: 64,
        barStart: 10,
        barWidth: 5,
        xSpacing: 1,
        ySpacing: 1,
        sliceIndex,
      })
    );

    await testUtils.setStackOnNextViewport(viewport, imageIds, 1);
    expect(viewport.getCurrentMode()).toBe('stack');

    const { imageData } = viewport.getImageData();
    const [startWorld, endWorld] = await dragBetweenIndices(
      viewport,
      imageData,
      [20, 10, 0],
      [40, 30, 0]
    );
    const rectangle = expectRectangleBetween(viewport, startWorld, endWorld);

    expect(rectangle?.metadata.referencedImageId).toBe(imageIds[1]);
    expect(rectangle?.metadata.volumeId).toBeUndefined();
  });
});
