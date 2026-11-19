import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { utilities, Enums, volumeLoader } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;
const { PanTool, ToolGroupManager } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'panToolOptionsNext';

/**
 * The pan in canvas pixels that the legacy stack viewport and the legacy
 * sagittal volume viewport of commit 58914567b gave after one drag of
 * [20, 15] canvas pixels from the fit, for each configuration of the tool.
 */
const LEGACY_PANS = {
  stack: {
    none: [20, 15],
    ignoreX: [0, 15],
    ignoreY: [20, 0],
    ignoreZ: [20, 15],
  },
  sagittal: {
    none: [20, 15],
    ignoreX: [20, 15],
    ignoreY: [0, 15],
    ignoreZ: [20, 0],
  },
};

/**
 * The drags of a stack of one image of 64 by 64 pixels in a viewport of 400
 * by 300 pixels with `limitToViewport`, one after the other, and the pan of
 * the legacy stack viewport after each, at the zoom of the fit and at twice
 * that zoom. At the fit the picture moves only where it stays inside the
 * canvas; zoomed in, only where it keeps covering the canvas.
 */
const LEGACY_LIMITED_DRAGS = [
  {
    zoom: 1,
    drags: [
      [
        [30, 0],
        [30, 0],
      ],
      [
        [0, 10],
        [30, 0],
      ],
      [
        [-30, 0],
        [0, 0],
      ],
      [
        [60, 0],
        [0, 0],
      ],
      [
        [0, -20],
        [0, 0],
      ],
      [
        [100, 0],
        [0, 0],
      ],
      [
        [-200, 0],
        [0, 0],
      ],
    ],
  },
  {
    zoom: 2,
    drags: [
      [
        [30, 0],
        [30, 0],
      ],
      [
        [0, 10],
        [30, 10],
      ],
      [
        [-30, 0],
        [0, 10],
      ],
      [
        [60, 0],
        [60, 10],
      ],
      [
        [0, -20],
        [60, -10],
      ],
      [
        [100, 0],
        [60, -10],
      ],
      [
        [-200, 0],
        [60, -10],
      ],
    ],
  },
];

/** Makes a direct next planar viewport of 400 by 300 pixels. */
function createViewport(renderingEngine, viewportId, orientation) {
  testUtils.createViewports(renderingEngine, {
    viewportType: ViewportType.PLANAR,
    viewportId,
    orientation,
    width: 400,
    height: 300,
  });

  return renderingEngine.getViewport(viewportId);
}

/** Shows one image of 64 by 64 pixels of 1 mm as a stack. */
async function createStack(renderingEngine) {
  const viewport = createViewport(
    renderingEngine,
    'panStack',
    OrientationAxis.ACQUISITION
  );
  const imageId = testUtils.encodeImageIdInfo({
    loader: 'fakeImageLoader',
    name: 'imageURI',
    rows: 64,
    columns: 64,
    barStart: 10,
    barWidth: 5,
    xSpacing: 1,
    ySpacing: 1,
    sliceIndex: 0,
  });

  await testUtils.setStackOnNextViewport(viewport, [imageId], 0);
  viewport.render();

  return viewport;
}

/** Shows a volume of 64 by 64 by 20 voxels of 1 mm in a sagittal view. */
async function createSagittal(renderingEngine) {
  const viewport = createViewport(
    renderingEngine,
    'panSagittal',
    OrientationAxis.SAGITTAL
  );
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURI',
    rows: 64,
    columns: 64,
    slices: 20,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
  await testUtils.setVolumesOnNextViewport(viewport, [volumeId]);
  viewport.render();

  return viewport;
}

/** Makes the pan tool with a configuration, active on the viewport. */
function createPanTool(viewportId, configuration) {
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(PanTool.toolName, configuration);
  toolGroup.addViewport(viewportId, renderingEngineId);
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: 1 }],
  });

  return toolGroup.getToolInstance(PanTool.toolName);
}

/**
 * Gives the tool one drag of a canvas delta from the centre of the canvas,
 * with the world delta of the same two canvas points, as a mouse drag does.
 */
function drag(tool, viewport, canvasDelta) {
  const from = [200, 150];
  const to = [from[0] + canvasDelta[0], from[1] + canvasDelta[1]];
  const fromWorld = viewport.canvasToWorld(from);
  const toWorld = viewport.canvasToWorld(to);

  tool._dragCallback({
    detail: {
      element: viewport.element,
      deltaPoints: {
        canvas: [...canvasDelta],
        world: [0, 1, 2].map((axis) => toWorld[axis] - fromWorld[axis]),
      },
    },
  });
}

function expectPanClose(viewport, expected) {
  const pan = viewport.getPan();

  expect(pan[0]).toBeCloseTo(expected[0], 3);
  expect(pan[1]).toBeCloseTo(expected[1], 3);
}

describe('PanTool options on direct next planar viewports -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [],
      tools: [PanTool],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  for (const [scene, create] of [
    ['stack', createStack],
    ['sagittal', createSagittal],
  ]) {
    for (const option of ['none', 'ignoreX', 'ignoreY', 'ignoreZ']) {
      it(`pans a ${scene} with ${option} as the legacy viewport`, async function () {
        const viewport = await create(renderingEngine);
        const tool = createPanTool(
          viewport.id,
          option === 'none' ? {} : { [option]: true }
        );

        drag(tool, viewport, [20, 15]);

        expectPanClose(viewport, LEGACY_PANS[scene][option]);
      });
    }
  }

  for (const { zoom, drags } of LEGACY_LIMITED_DRAGS) {
    it(`keeps the picture of a stack in the canvas with limitToViewport at zoom ${zoom}, as the legacy viewport`, async function () {
      const viewport = await createStack(renderingEngine);
      const tool = createPanTool(viewport.id, { limitToViewport: true });

      viewport.setZoom(zoom);

      for (const [canvasDelta, legacyPan] of drags) {
        drag(tool, viewport, canvasDelta);
        expectPanClose(viewport, legacyPan);
      }
    });
  }

  it('moves the picture of a stack down on a drag right and down with limitToViewport and ignoreX, when the picture touches the right edge of the canvas', async function () {
    const viewport = await createStack(renderingEngine);
    const tool = createPanTool(viewport.id, {
      limitToViewport: true,
      ignoreX: true,
    });

    viewport.setZoom(0.5);
    viewport.setPan([125, 0]);

    drag(tool, viewport, [20, 20]);

    expectPanClose(viewport, [125, 20]);
  });
});
