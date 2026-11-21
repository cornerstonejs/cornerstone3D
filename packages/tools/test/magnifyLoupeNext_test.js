import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const {
  utilities,
  Enums,
  volumeLoader,
  imageLoader,
  cache,
  eventTarget,
  PlanarViewport,
} = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;
const { MagnifyTool, AdvancedMagnifyTool, ToolGroupManager, segmentation } =
  csTools3d;
const { SegmentationRepresentations } = csTools3d.Enums;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'magnifyLoupeNext';
const MAGNIFY_VIEWPORT_ID = 'magnify-viewport';

/** The window, the invert and the colormap of the source display set. */
const PRESENTATION = {
  voiRange: { lower: 30, upper: 150 },
  invert: true,
  colormap: { name: 'hsv' },
};

/** The canvas offsets from the centre of a loupe where its pixels are read. */
const PIXEL_STEPS = [-60, -30, 0, 30, 60];

/** The largest difference of one colour value between two pixels. */
const COLOUR_TOLERANCE = 8;

/**
 * What the legacy loupe of `MagnifyTool` showed, measured on the legacy tree
 * of 58914567b with `magnifySize` 4, a loupe of 250 by 250 pixels and a source
 * of 400 by 300 pixels. In stack mode the source is a legacy stack viewport
 * with rotation 270 and `flipHorizontal` in one `setViewPresentation`, which
 * shows the same picture as a next viewport with the same rotation and flip
 * (the same world point under each canvas point, the same colours). In
 * volume mode the source is a next viewport with rotation 180 and
 * `flipVertical`, which a legacy viewport shows the same way, and the loupe
 * is the legacy stack viewport that the
 * tool made there. `world` gives the world points at the centre of the loupe,
 * 50 pixels to its right and 50 pixels below it; `pixels` the colours at the
 * offsets of `PIXEL_STEPS`, row by row. `dragged` is after a drag of the
 * pointer by 20 pixels to the right and 10 down.
 */
const LEGACY_MAGNIFY = {
  stack: {
    worldPerPixel: 0.042667,
    pressed: {
      world: [
        [27.2333, 35.7667, 1],
        [27.2333, 37.9, 1],
        [29.3667, 35.7667, 1],
      ],
      pixels: [
        [
          [255, 0, 161],
          [255, 0, 177],
          [255, 0, 194],
          [255, 0, 210],
          [255, 0, 227],
        ],
        [
          [255, 0, 194],
          [255, 0, 210],
          [255, 0, 227],
          [255, 0, 243],
          [251, 0, 255],
        ],
        [
          [255, 0, 227],
          [255, 0, 243],
          [251, 0, 255],
          [235, 0, 255],
          [218, 0, 255],
        ],
        [
          [251, 0, 255],
          [235, 0, 255],
          [218, 0, 255],
          [202, 0, 255],
          [186, 0, 255],
        ],
        [
          [218, 0, 255],
          [202, 0, 255],
          [186, 0, 255],
          [169, 0, 255],
          [153, 0, 255],
        ],
      ],
    },
    dragged: {
      world: [
        [28.6556, 38.6111, 1],
        [28.6556, 40.7444, 1],
        [30.7889, 38.6111, 1],
      ],
      pixels: [
        [
          [255, 0, 234],
          [255, 0, 250],
          [244, 0, 255],
          [228, 0, 255],
          [211, 0, 255],
        ],
        [
          [244, 0, 255],
          [228, 0, 255],
          [211, 0, 255],
          [195, 0, 255],
          [179, 0, 255],
        ],
        [
          [211, 0, 255],
          [195, 0, 255],
          [179, 0, 255],
          [162, 0, 255],
          [146, 0, 255],
        ],
        [
          [179, 0, 255],
          [162, 0, 255],
          [146, 0, 255],
          [129, 0, 255],
          [113, 0, 255],
        ],
        [
          [146, 0, 255],
          [129, 0, 255],
          [113, 0, 255],
          [96, 0, 255],
          [80, 0, 255],
        ],
      ],
    },
  },
  volume: {
    worldPerPixel: 0.033333,
    pressed: {
      world: [
        [21.7222, 20.6111, 4],
        [20.0556, 20.6111, 4],
        [21.7222, 22.2778, 4],
      ],
      pixels: [
        [
          [255, 51, 0],
          [255, 76, 0],
          [255, 101, 0],
          [255, 127, 0],
          [255, 153, 0],
        ],
        [
          [255, 38, 0],
          [255, 64, 0],
          [255, 89, 0],
          [255, 114, 0],
          [255, 140, 0],
        ],
        [
          [255, 25, 0],
          [255, 51, 0],
          [255, 76, 0],
          [255, 101, 0],
          [255, 127, 0],
        ],
        [
          [255, 12, 0],
          [255, 38, 0],
          [255, 64, 0],
          [255, 89, 0],
          [255, 114, 0],
        ],
        [
          [255, 0, 1],
          [255, 25, 0],
          [255, 51, 0],
          [255, 76, 0],
          [255, 101, 0],
        ],
      ],
    },
    dragged: {
      world: [
        [19.5, 21.7222, 4],
        [17.8333, 21.7222, 4],
        [19.5, 23.3889, 4],
      ],
      pixels: [
        [
          [255, 93, 0],
          [255, 119, 0],
          [255, 144, 0],
          [255, 170, 0],
          [255, 195, 0],
        ],
        [
          [255, 80, 0],
          [255, 106, 0],
          [255, 131, 0],
          [255, 157, 0],
          [255, 182, 0],
        ],
        [
          [255, 68, 0],
          [255, 93, 0],
          [255, 119, 0],
          [255, 144, 0],
          [255, 170, 0],
        ],
        [
          [255, 55, 0],
          [255, 80, 0],
          [255, 106, 0],
          [255, 131, 0],
          [255, 157, 0],
        ],
        [
          [255, 42, 0],
          [255, 68, 0],
          [255, 93, 0],
          [255, 119, 0],
          [255, 144, 0],
        ],
      ],
    },
  },
};

/**
 * What the legacy glass of `AdvancedMagnifyTool` showed, measured on the
 * legacy tree of 58914567b with a legacy viewport as its source (a stack
 * viewport, or a volume viewport for the volume) and the zoom factor 3: the
 * world distance of one pixel and the world point at the centre of the glass.
 * The legacy glass shows 1 / 3 of the source width over its own width, so it
 * magnifies a source of 400 by 300 pixels 4 times.
 *
 * `right` and `down` are the world points 50 pixels to the right of and below
 * the centre, which the glass now shows turned and flipped as its source. The
 * legacy glass did not do that: it showed the stack unturned and unflipped
 * (right [29.0111, 35.7667, 1], down [27.2333, 37.5444, 1]), the axial slice
 * turned and not flipped (down [21.7222, 19.2222, 4]) and the sagittal slice
 * unflipped (right [20, 22.2083, 4.6667]).
 *
 * The legacy glass showed the labelmaps of its source: the
 * advancedMagnifyTool example of 58914567b, on legacy volume viewports, shows
 * the segments in the sagittal and the coronal glass. On a legacy volume
 * viewport it mounted every volume, a fusion too, and gave the presentation
 * of the first volume only (read in the code of 58914567b, not measured). The
 * legacy loupe of `MagnifyTool` showed the image of a stack alone.
 */
const LEGACY_ADVANCED_MAGNIFY = {
  stack: {
    worldPerPixel: 0.035556,
    world: [
      [27.2333, 35.7667, 1],
      [27.2333, 37.5444, 1],
      [29.0111, 35.7667, 1],
    ],
  },
  axial: {
    worldPerPixel: 0.027778,
    world: [
      [21.7222, 20.6111, 4],
      [20.3333, 20.6111, 4],
      [21.7222, 22.0, 4],
    ],
  },
  sagittal: {
    worldPerPixel: 0.020833,
    world: [
      [20, 21.1667, 4.6667],
      [20, 20.125, 4.6667],
      [20, 21.1667, 3.625],
    ],
  },
};

const STACK_VIEW = { rotation: 270, flipHorizontal: true };
const AXIAL_VIEW = { rotation: 180, flipVertical: true };
const SAGITTAL_VIEW = { flipHorizontal: true };

/** Three images of 64 by 64 pixels whose values rise to the right and down. */
function createRampImageIds() {
  return [0, 1, 2].map((sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'imageURI',
      id: 'magnifyRamp',
      rows: 64,
      columns: 64,
      barStart: 0,
      barWidth: 1,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex,
    })
  );
}

/** Loads the ramp images into the cache and writes their values. */
async function loadRampImages(imageIds) {
  for (const [sliceIndex, imageId] of imageIds.entries()) {
    const image = await imageLoader.loadAndCacheImage(imageId);

    for (let j = 0; j < image.rows; j++) {
      for (let i = 0; i < image.columns; i++) {
        image.voxelManager.setAtIJK(i, j, 0, 2 * i + j + 20 * sliceIndex);
      }
    }
  }
}

/**
 * A volume of 40 by 40 by 12 voxels. Its values rise along each axis, or are
 * given by `valueAt` of the indices.
 */
async function createRampVolume(
  name,
  valueAt = (i, j, k) => 2 * i + j + 5 * k
) {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name,
    id: name,
    rows: 40,
    columns: 40,
    slices: 12,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  const volume = cache.getVolume(volumeId);
  const [x, y, z] = volume.dimensions;

  for (let k = 0; k < z; k++) {
    for (let j = 0; j < y; j++) {
      for (let i = 0; i < x; i++) {
        volume.voxelManager.setAtIJK(i, j, k, valueAt(i, j, k));
      }
    }
  }

  volume.modified();

  return volume;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolves at the next IMAGE_RENDERED of a viewport, or after half a second. */
function waitForRender(viewport) {
  return new Promise((resolve) => {
    const finish = () => {
      viewport.element.removeEventListener(Events.IMAGE_RENDERED, finish);
      clearTimeout(timer);
      setTimeout(resolve, 50);
    };
    const timer = setTimeout(finish, 500);

    viewport.element.addEventListener(Events.IMAGE_RENDERED, finish);
  });
}

/** Renders a viewport and waits for the picture. */
function renderAndWait(viewport) {
  const rendered = waitForRender(viewport);

  viewport.render();

  return rendered;
}

/** Makes the next planar viewport of 400 by 300 pixels that is magnified. */
function createSource(renderingEngine) {
  testUtils.createViewports(renderingEngine, {
    viewportId: 'source',
    viewportType: ViewportType.PLANAR,
    orientation: OrientationAxis.ACQUISITION,
    width: 400,
    height: 300,
    useEnableElement: true,
  });
  ToolGroupManager.getToolGroup(toolGroupId).addViewport(
    'source',
    renderingEngineId
  );

  return renderingEngine.getViewport('source');
}

/** Shows the second ramp image, with the presentation, turned and zoomed. */
async function showStack(source) {
  const imageIds = createRampImageIds();

  await loadRampImages(imageIds);
  utilities.genericViewportDisplaySetMetadataProvider.add('magnifyRamp', {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: 1,
  });
  await source.setDisplaySets({ displaySetId: 'magnifyRamp' });
  source.setDisplaySetPresentation('magnifyRamp', PRESENTATION);
  source.setViewState(STACK_VIEW);
  source.setZoom(1.5);
  await renderAndWait(source);
}

/**
 * Shows a slice of a ramp volume, with the presentation, turned and zoomed,
 * and gives the volume.
 */
async function showVolume(source, name, orientation, imageIdIndex, view) {
  const volume = await createRampVolume(name);

  utilities.genericViewportDisplaySetMetadataProvider.add(name, {
    imageIds: volume.imageIds,
    volumeId: volume.volumeId,
  });
  await source.setDisplaySets({
    displaySetId: name,
    options: { orientation },
  });
  await source.setImageIdIndex(imageIdIndex);
  source.setDisplaySetPresentation(name, PRESENTATION);
  source.setViewState(view);
  source.setZoom(1.2);
  await renderAndWait(source);

  return volume;
}

/**
 * Shows a fusion: a ramp volume as the source display set, and over it a
 * volume whose values rise down the rows, in the colormap `hsv` at half
 * opacity. Gives the ids of the two display sets.
 */
async function showFusion(source, name) {
  const base = await createRampVolume(`${name}Base`);
  const overlay = await createRampVolume(`${name}Overlay`, (i, j) => 4 * j);
  const displaySetIds = [`${name}Base`, `${name}Overlay`];

  [base, overlay].forEach((volume, index) => {
    utilities.genericViewportDisplaySetMetadataProvider.add(
      displaySetIds[index],
      { imageIds: volume.imageIds, volumeId: volume.volumeId }
    );
  });
  await source.setDisplaySets(
    {
      displaySetId: displaySetIds[0],
      options: { orientation: OrientationAxis.AXIAL },
    },
    {
      displaySetId: displaySetIds[1],
      options: { orientation: OrientationAxis.AXIAL, role: 'overlay' },
    }
  );
  await source.setImageIdIndex(7);
  source.setDisplaySetPresentation(displaySetIds[0], {
    voiRange: PRESENTATION.voiRange,
  });
  source.setDisplaySetPresentation(displaySetIds[1], {
    voiRange: { lower: 0, upper: 160 },
    colormap: { name: 'hsv', opacity: 0.5 },
  });
  source.setZoom(1.2);
  await renderAndWait(source);

  return displaySetIds;
}

/** Waits until a loupe shows data and has drawn it. */
async function waitForLoupe(getLoupe) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const loupe = getLoupe();

    if (loupe?.getCurrentMode?.() && loupe.getCurrentMode() !== 'empty') {
      break;
    }

    await wait(20);
  }

  await waitForRender(getLoupe());

  return getLoupe();
}

/** The pixels of the canvas of a viewport, as RGBA bytes. */
function readPixels(viewport) {
  const source = viewport.getCanvas();
  const canvas = document.createElement('canvas');

  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext('2d').drawImage(source, 0, 0);

  return canvas
    .getContext('2d')
    .getImageData(0, 0, source.width, source.height);
}

function pixelAt(picture, x, y) {
  const offset = (Math.floor(y) * picture.width + Math.floor(x)) * 4;

  return [
    picture.data[offset],
    picture.data[offset + 1],
    picture.data[offset + 2],
  ];
}

function worldPerPixel(viewport) {
  const top = viewport.canvasToWorld([0, 0]);
  const bottom = viewport.canvasToWorld([0, 1]);

  return Math.hypot(top[0] - bottom[0], top[1] - bottom[1], top[2] - bottom[2]);
}

/** The world size of one canvas pixel along the width and the height. */
function pixelSizes(viewport) {
  const origin = viewport.canvasToWorld([0, 0]);
  const right = viewport.canvasToWorld([1, 0]);
  const down = viewport.canvasToWorld([0, 1]);

  return {
    horizontal: Math.hypot(
      right[0] - origin[0],
      right[1] - origin[1],
      right[2] - origin[2]
    ),
    vertical: Math.hypot(
      down[0] - origin[0],
      down[1] - origin[1],
      down[2] - origin[2]
    ),
  };
}

/**
 * Expects a loupe to keep the stretch of its source: the world size of one
 * pixel along the width over that along the height is the same in both,
 * and one pixel of the loupe spans `verticalWorldPerPixel` along its height.
 */
function expectStretchOfSource(loupe, source, verticalWorldPerPixel) {
  const loupeSizes = pixelSizes(loupe);
  const sourceSizes = pixelSizes(source);

  expect(loupeSizes.horizontal / loupeSizes.vertical).toBeCloseTo(
    sourceSizes.horizontal / sourceSizes.vertical,
    5
  );
  expect(loupeSizes.vertical).toBeCloseTo(verticalWorldPerPixel, 5);
}

/**
 * The view states that stretch a view to twice its width: a scale of two
 * values, and a display area of such a scale.
 */
const STRETCHES = {
  scale: { scale: [2, 1] },
  'display area': { displayArea: { type: 'SCALE', scale: [2, 1] } },
};

/** Shows the stack as `showStack`, stretched to twice its width. */
async function showStretchedStack(source, stretch = STRETCHES.scale) {
  await showStack(source);
  source.setViewState(stretch);
  await renderAndWait(source);
}

function getCentre(viewport) {
  return [viewport.element.clientWidth / 2, viewport.element.clientHeight / 2];
}

function expectColour(actual, expected) {
  actual.forEach((value, channel) => {
    expect(Math.abs(value - expected[channel])).toBeLessThanOrEqual(
      COLOUR_TOLERANCE
    );
  });
}

/** Expects a loupe to be a direct next planar viewport. */
function expectNextPlanarLoupe(loupe) {
  expect(loupe.constructor).toBe(PlanarViewport);
  expect(loupe.type).toBe(ViewportType.PLANAR);
}

/**
 * Expects the world distance of one loupe pixel, and the world points at the
 * centre of the loupe, 50 pixels to its right and 50 pixels below it.
 */
function expectView(loupe, expected) {
  const [x, y] = getCentre(loupe);

  expect(worldPerPixel(loupe)).toBeCloseTo(expected.worldPerPixel, 5);
  [
    [x, y],
    [x + 50, y],
    [x, y + 50],
  ].forEach((canvasPoint, index) => {
    const world = loupe.canvasToWorld(canvasPoint);

    expected.world[index].forEach((value, axis) => {
      expect(world[axis]).toBeCloseTo(value, 3);
    });
  });
}

/** Expects the colours of a loupe at the offsets of `PIXEL_STEPS`. */
function expectPixels(loupe, expected) {
  const picture = readPixels(loupe);
  const [x, y] = getCentre(loupe);

  PIXEL_STEPS.forEach((dy, row) => {
    PIXEL_STEPS.forEach((dx, column) => {
      expectColour(pixelAt(picture, x + dx, y + dy), expected[row][column]);
    });
  });
}

/**
 * Expects a loupe to have the colours of its source: each pixel of the loupe
 * at the offsets of `PIXEL_STEPS` has the colour of the source pixel that
 * shows the same world point.
 */
function expectColoursOfSource(loupe, source) {
  const loupePicture = readPixels(loupe);
  const sourcePicture = readPixels(source);
  const [x, y] = getCentre(loupe);

  PIXEL_STEPS.forEach((dy) => {
    PIXEL_STEPS.forEach((dx) => {
      const pixel = [Math.floor(x + dx), Math.floor(y + dy)];
      const world = loupe.canvasToWorld([pixel[0] + 0.5, pixel[1] + 0.5]);
      const sourcePoint = source.worldToCanvas(world);

      expectColour(
        pixelAt(loupePicture, pixel[0], pixel[1]),
        pixelAt(sourcePicture, sourcePoint[0], sourcePoint[1])
      );
    });
  });
}

/** Expects the presentation of the source display set on the loupe. */
function expectPresentationOfSource(loupe, source) {
  const displaySetId = source.getSourceDataId();
  const presentation = loupe.getDisplaySetPresentation(displaySetId);

  expect(presentation.voiRange.lower).toBeCloseTo(PRESENTATION.voiRange.lower);
  expect(presentation.voiRange.upper).toBeCloseTo(PRESENTATION.voiRange.upper);
  expect(presentation.invert).toBe(true);
  expect(presentation.colormap.name).toBe(PRESENTATION.colormap.name);
}

/**
 * Resolves at the next SEGMENTATION_RENDERED of a viewport, or after one and
 * a half seconds, and then at its next draw.
 */
async function waitForSegmentationRender(viewport) {
  await new Promise((resolve) => {
    const finish = (evt) => {
      if (evt && evt.detail?.viewportId !== viewport.id) {
        return;
      }

      eventTarget.removeEventListener(
        csTools3d.Enums.Events.SEGMENTATION_RENDERED,
        finish
      );
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 1500);

    eventTarget.addEventListener(
      csTools3d.Enums.Events.SEGMENTATION_RENDERED,
      finish
    );
  });
  await renderAndWait(viewport);
}

/**
 * Adds to a viewport a labelmap of a volume, with segment 1 on the voxels
 * whose first index is below 20.
 */
async function addLabelmap(viewport, volumeId, segmentationId) {
  const labelmap = volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: segmentationId,
  });
  const [x, y, z] = labelmap.dimensions;

  for (let k = 0; k < z; k++) {
    for (let j = 0; j < y; j++) {
      for (let i = 0; i < Math.min(x, 20); i++) {
        labelmap.voxelManager.setAtIJK(i, j, k, 1);
      }
    }
  }

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: SegmentationRepresentations.Labelmap,
        data: { volumeId: segmentationId },
      },
    },
  ]);

  const rendered = waitForSegmentationRender(viewport);

  await segmentation.addSegmentationRepresentations(viewport.id, [
    { segmentationId, type: SegmentationRepresentations.Labelmap },
  ]);
  await rendered;
}

function pointer(viewport, canvas) {
  return {
    element: viewport.element,
    currentPoints: { canvas, world: viewport.canvasToWorld(canvas) },
  };
}

describe('The loupe of MagnifyTool on a next planar viewport -- ', () => {
  let renderingEngine;
  let tool;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [MagnifyTool],
    });

    renderingEngine = testEnv.renderingEngine;
    tool = testEnv.toolGroups[toolGroupId].getToolInstance(
      MagnifyTool.toolName
    );
    tool.configuration.magnifySize = 4;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  /**
   * Presses the tool at a canvas point of the source, drags the pointer 20
   * pixels to the right and 10 down, and checks the loupe after each.
   */
  async function pressAndDrag(source, canvas, legacy) {
    const getLoupe = () => renderingEngine.getViewport(MAGNIFY_VIEWPORT_ID);

    tool.preMouseDownCallback({
      type: csTools3d.Enums.Events.MOUSE_DOWN,
      detail: pointer(source, canvas),
      preventDefault() {},
    });

    const loupe = await waitForLoupe(getLoupe);

    expectNextPlanarLoupe(loupe);
    expectPresentationOfSource(loupe, source);
    expectView(loupe, {
      ...legacy.pressed,
      worldPerPixel: legacy.worldPerPixel,
    });
    expectPixels(loupe, legacy.pressed.pixels);
    expectColoursOfSource(loupe, source);

    const next = [canvas[0] + 20, canvas[1] + 10];
    const worldBefore = source.canvasToWorld(canvas);
    const worldAfter = source.canvasToWorld(next);
    const rendered = waitForRender(loupe);

    tool._dragCallback({
      detail: {
        ...pointer(source, next),
        deltaPoints: {
          canvas: [20, 10],
          world: worldAfter.map((value, axis) => value - worldBefore[axis]),
        },
      },
    });
    await rendered;

    expectView(loupe, {
      ...legacy.dragged,
      worldPerPixel: legacy.worldPerPixel,
    });
    expectPixels(loupe, legacy.dragged.pixels);

    tool._dragEndCallback({ detail: { element: source.element } });

    expect(getLoupe()).toBeUndefined();
  }

  it('shows the image under the pointer magnified, turned and flipped as its source in stack mode', async function () {
    const source = createSource(renderingEngine);

    await showStack(source);
    await pressAndDrag(source, [230, 120], LEGACY_MAGNIFY.stack);
  }, 20000);

  it('centres the loupe on the point under the pointer when the pointer moved before the loupe was mounted', async function () {
    const source = createSource(renderingEngine);
    const getLoupe = () => renderingEngine.getViewport(MAGNIFY_VIEWPORT_ID);
    const pressed = [230, 120];
    const dragged = [260, 140];

    await showStack(source);

    const worldPressed = source.canvasToWorld(pressed);
    const worldDragged = source.canvasToWorld(dragged);

    tool.preMouseDownCallback({
      type: csTools3d.Enums.Events.MOUSE_DOWN,
      detail: pointer(source, pressed),
      preventDefault() {},
    });
    tool._dragCallback({
      detail: {
        ...pointer(source, dragged),
        deltaPoints: {
          canvas: [30, 20],
          world: worldDragged.map((value, axis) => value - worldPressed[axis]),
        },
      },
    });

    expect(getLoupe().getViewState().anchorWorld).toBeUndefined();

    const loupe = await waitForLoupe(getLoupe);
    const centreWorld = loupe.canvasToWorld(getCentre(loupe));

    worldDragged.forEach((value, axis) => {
      expect(centreWorld[axis]).toBeCloseTo(value, 3);
    });

    tool._dragEndCallback({ detail: { element: source.element } });
  }, 20000);

  it('shows the slice under the pointer magnified, turned and flipped as its source in volume mode', async function () {
    const source = createSource(renderingEngine);

    await showVolume(
      source,
      'magnifyLoupeAxial',
      OrientationAxis.AXIAL,
      7,
      AXIAL_VIEW
    );

    expect(source.getCurrentMode()).toBe('volume');

    await pressAndDrag(source, [180, 160], LEGACY_MAGNIFY.volume);
  }, 20000);

  it('shows the overlays of its source with their presentation', async function () {
    const source = createSource(renderingEngine);
    const displaySetIds = await showFusion(source, 'magnifyLoupeFusion');
    const getLoupe = () => renderingEngine.getViewport(MAGNIFY_VIEWPORT_ID);

    tool.preMouseDownCallback({
      type: csTools3d.Enums.Events.MOUSE_DOWN,
      detail: pointer(source, [180, 160]),
      preventDefault() {},
    });

    const loupe = await waitForLoupe(getLoupe);

    expectNextPlanarLoupe(loupe);
    expect(
      loupe.getDisplaySets().map(({ displaySetId }) => displaySetId)
    ).toEqual(displaySetIds);
    expectColoursOfSource(loupe, source);

    tool._dragEndCallback({ detail: { element: source.element } });
  }, 20000);

  Object.entries(STRETCHES).forEach(([name, stretch]) => {
    it(`keeps the stretch of its source by a ${name}, which the legacy loupe dropped`, async function () {
      const source = createSource(renderingEngine);
      const getLoupe = () => renderingEngine.getViewport(MAGNIFY_VIEWPORT_ID);

      await showStretchedStack(source, stretch);

      expect(
        pixelSizes(source).vertical / pixelSizes(source).horizontal
      ).toBeCloseTo(2, 5);

      tool.preMouseDownCallback({
        type: csTools3d.Enums.Events.MOUSE_DOWN,
        detail: pointer(source, [230, 120]),
        preventDefault() {},
      });

      const loupe = await waitForLoupe(getLoupe);

      expectStretchOfSource(
        loupe,
        source,
        (pixelSizes(source).vertical * source.element.clientHeight) /
          (tool.configuration.magnifySize * loupe.element.clientHeight)
      );
      expectColoursOfSource(loupe, source);

      tool._dragEndCallback({ detail: { element: source.element } });
    }, 20000);
  });
});

describe('The glass of AdvancedMagnifyTool on a next planar viewport -- ', () => {
  let renderingEngine;
  let tool;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [AdvancedMagnifyTool],
    });

    renderingEngine = testEnv.renderingEngine;
    tool = testEnv.toolGroups[toolGroupId].getToolInstance(
      AdvancedMagnifyTool.toolName
    );
  });

  afterEach(function () {
    tool.magnifyViewportManager.dispose();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  /** Adds a glass at a canvas point of the source and gives its viewport. */
  async function addGlass(source, canvas) {
    const annotation = tool.addNewAnnotation({
      detail: pointer(source, canvas),
      preventDefault() {},
    });
    const glassId = annotation.data.magnifyViewportId;

    return waitForLoupe(() => renderingEngine.getViewport(glassId));
  }

  it('shows the image under it magnified, turned and flipped as its source in stack mode', async function () {
    const source = createSource(renderingEngine);

    await showStack(source);

    const glass = await addGlass(source, [230, 120]);

    expectNextPlanarLoupe(glass);
    expectPresentationOfSource(glass, source);
    expectView(glass, LEGACY_ADVANCED_MAGNIFY.stack);
    expectColoursOfSource(glass, source);
  }, 20000);

  it('drops the presentation of its source when the source resets it, as the source does', async function () {
    const source = createSource(renderingEngine);

    ToolGroupManager.getToolGroup(toolGroupId).setToolPassive(
      AdvancedMagnifyTool.toolName
    );
    await showStack(source);

    const glass = await addGlass(source, [230, 120]);
    const displaySetId = source.getSourceDataId();

    expectPresentationOfSource(glass, source);

    const glassRendered = waitForRender(glass);

    source.resetDisplaySetPresentation(displaySetId);
    await renderAndWait(source);
    await glassRendered;

    expect(source.getDisplaySetPresentation(displaySetId)).toEqual({});
    expect(glass.getDisplaySetPresentation(displaySetId)).toEqual({});
    expectColoursOfSource(glass, source);

    const resets = spyOn(
      glass,
      'resetDisplaySetPresentation'
    ).and.callThrough();
    const glassRenderedAgain = waitForRender(glass);

    source.setDisplaySetPresentation(displaySetId, {
      voiRange: PRESENTATION.voiRange,
    });
    await renderAndWait(source);
    await glassRenderedAgain;

    expect(glass.getDisplaySetPresentation(displaySetId)).toEqual({
      voiRange: PRESENTATION.voiRange,
    });
    expect(resets).not.toHaveBeenCalled();
  }, 20000);

  it('shows the slice under it magnified, turned and flipped as its source in volume mode', async function () {
    const source = createSource(renderingEngine);

    await showVolume(
      source,
      'advancedLoupeAxial',
      OrientationAxis.AXIAL,
      7,
      AXIAL_VIEW
    );

    const glass = await addGlass(source, [180, 160]);

    expectNextPlanarLoupe(glass);
    expect(glass.getCurrentMode()).toBe('volume');
    expectPresentationOfSource(glass, source);
    expectView(glass, LEGACY_ADVANCED_MAGNIFY.axial);
    expectColoursOfSource(glass, source);
  }, 20000);

  it('shows a sagittal slice of a volume, which has no image of its own', async function () {
    const source = createSource(renderingEngine);

    await showVolume(
      source,
      'advancedLoupeSagittal',
      OrientationAxis.SAGITTAL,
      20,
      SAGITTAL_VIEW
    );

    expect(source.getCurrentImageId()).toBeUndefined();

    const glass = await addGlass(source, [180, 160]);

    expectNextPlanarLoupe(glass);
    expect(glass.getCurrentMode()).toBe('volume');
    expectPresentationOfSource(glass, source);
    expectView(glass, LEGACY_ADVANCED_MAGNIFY.sagittal);
    expectColoursOfSource(glass, source);
  }, 20000);

  it('shows the labelmap of its source', async function () {
    const source = createSource(renderingEngine);

    const volume = await showVolume(
      source,
      'advancedLoupeLabelmap',
      OrientationAxis.AXIAL,
      7,
      {}
    );

    await addLabelmap(source, volume.volumeId, 'advancedLoupeSeg');

    const glass = await addGlass(source, [178, 150]);

    await waitForSegmentationRender(glass);

    expectNextPlanarLoupe(glass);
    expect(
      segmentation.state
        .getSegmentationRepresentations(glass.id)
        .map(({ segmentationId, type }) => [segmentationId, type])
    ).toEqual([['advancedLoupeSeg', SegmentationRepresentations.Labelmap]]);
    expectColoursOfSource(glass, source);
  }, 20000);

  it('shows the overlays of its source with their presentation', async function () {
    const source = createSource(renderingEngine);
    const displaySetIds = await showFusion(source, 'advancedLoupeFusion');
    const glass = await addGlass(source, [180, 160]);

    expectNextPlanarLoupe(glass);
    expect(
      glass.getDisplaySets().map(({ displaySetId }) => displaySetId)
    ).toEqual(displaySetIds);
    expectColoursOfSource(glass, source);
  }, 20000);

  /** The world size along the height of one pixel of a glass of the tool. */
  function glassWorldPerPixel(source, glass) {
    const { zoomFactor } = tool.magnifyViewportManager.getViewport(glass.id);

    return (
      (pixelSizes(source).vertical *
        source.element.clientHeight *
        glass.element.clientWidth) /
      (source.element.clientWidth * zoomFactor * glass.element.clientHeight)
    );
  }

  it('keeps the stretch of its source, which the legacy glass dropped, and follows a change of it', async function () {
    const source = createSource(renderingEngine);

    ToolGroupManager.getToolGroup(toolGroupId).setToolPassive(
      AdvancedMagnifyTool.toolName
    );
    await showStretchedStack(source);

    const glass = await addGlass(source, [230, 120]);

    expectStretchOfSource(glass, source, glassWorldPerPixel(source, glass));
    expectColoursOfSource(glass, source);

    source.setViewState({ scale: [3, 1] });
    await renderAndWait(source);
    await waitForRender(glass);

    expect(
      pixelSizes(source).vertical / pixelSizes(source).horizontal
    ).toBeCloseTo(3, 5);
    expectStretchOfSource(glass, source, glassWorldPerPixel(source, glass));
  }, 20000);
});
