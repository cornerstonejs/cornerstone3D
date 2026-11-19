import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { CIRCLE_STRATEGY } from '../src/tools/segmentation/strategies/fillCircle';
import { SPHERE_STRATEGY } from '../src/tools/segmentation/strategies/fillSphere';

const { utilities, Enums, volumeLoader, cache } = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;
const { StrategyCallbacks } = csTools3d.Enums;

const renderingEngineId = utilities.uuidv4();
const RADIUS = 8;

/** Makes a direct next planar viewport of 400 by 300 pixels. */
function createNextViewport(renderingEngine) {
  testUtils.createViewports(renderingEngine, {
    viewportId: 'next',
    viewportType: ViewportType.PLANAR,
    orientation: OrientationAxis.ACQUISITION,
    width: 400,
    height: 300,
    useEnableElement: true,
  });

  return renderingEngine.getViewport('next');
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
 * Shows a stack of 64 by 64 images of 1 mm and gives the vtk image data of
 * the image shown, as the grid of a labelmap on it.
 */
async function showStack(viewport) {
  const imageIds = [0, 1, 2].map((sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'imageURI',
      id: 'brushStretchStack',
      rows: 64,
      columns: 64,
      barStart: 10,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex,
    })
  );

  utilities.genericViewportDisplaySetMetadataProvider.add('brushStack', {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({
    displaySetId: 'brushStack',
    options: { renderBackend: 'gpu' },
  });
  await renderAndWait(viewport);

  return viewport.getDefaultImageData();
}

/**
 * Shows a volume of 64 columns, 60 rows and 20 slices of 1 mm in the axial
 * plane and gives its image data, as the grid of a labelmap on it.
 */
async function showVolume(viewport) {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'brushStretchVolume',
    id: 'brushStretchVolume',
    rows: 60,
    columns: 64,
    slices: 20,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
  utilities.genericViewportDisplaySetMetadataProvider.add('brushVolume', {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId: 'brushVolume',
    options: { orientation: OrientationAxis.AXIAL },
  });
  await renderAndWait(viewport);

  return cache.getVolume(volumeId).imageData;
}

function along(point, direction, distance) {
  return point.map((value, axis) => value + direction[axis] * distance);
}

/**
 * Runs the set up of a brush strategy for a brush of RADIUS mm at the centre
 * of the viewport, as the brush tool gives it the four points of its circle,
 * and tells for points right of and above the centre whether the brush
 * covers them.
 */
function brushCoverage(strategy, viewport, segmentationImageData) {
  const { viewUp, viewPlaneNormal } = viewport.getResolvedView().toICamera();
  const viewRight = [
    viewUp[1] * viewPlaneNormal[2] - viewUp[2] * viewPlaneNormal[1],
    viewUp[2] * viewPlaneNormal[0] - viewUp[0] * viewPlaneNormal[2],
    viewUp[0] * viewPlaneNormal[1] - viewUp[1] * viewPlaneNormal[0],
  ];
  const center = viewport.canvasToWorld([200, 150]);
  const operationData = {
    viewport,
    segmentationImageData,
    viewUp,
    viewPlaneNormal,
    points: [
      along(center, viewUp, -RADIUS),
      along(center, viewUp, RADIUS),
      along(center, viewRight, -RADIUS),
      along(center, viewRight, RADIUS),
    ],
  };

  strategy.compositions
    .find((composition) =>
      String(composition[StrategyCallbacks.Initialize]).includes('points')
    )
    [StrategyCallbacks.Initialize](operationData);

  const covers = (direction, distance) =>
    operationData.isInObject(along(center, direction, distance));

  return {
    right: [3, 5, 7, 9].map((distance) => covers(viewRight, distance)),
    up: [3, 5, 7, 9].map((distance) => covers(viewUp, distance)),
  };
}

describe('The brush on a stretched direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  [
    ['circle', CIRCLE_STRATEGY],
    ['sphere', SPHERE_STRATEGY],
  ].forEach(([shape, strategy]) => {
    [
      ['stack', showStack],
      ['volume', showVolume],
    ].forEach(([mode, show]) => {
      it(`fills a ${shape} that looks round on the stretched view in ${mode} mode`, async function () {
        const viewport = createNextViewport(renderingEngine);
        const segmentationImageData = await show(viewport);
        const round = brushCoverage(strategy, viewport, segmentationImageData);

        viewport.setViewState({ scale: [2, 1] });
        await renderAndWait(viewport);

        const stretched = brushCoverage(
          strategy,
          viewport,
          segmentationImageData
        );

        expect(viewport.getCurrentMode()).toBe(mode);
        expect(round).toEqual({
          right: [true, true, true, false],
          up: [true, true, true, false],
        });
        expect(stretched).toEqual({
          right: [true, false, false, false],
          up: [true, true, true, false],
        });
      });
    });
  });
});
