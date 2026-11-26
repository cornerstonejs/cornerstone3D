import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  TEST_VIDEO,
  addTestVideoMetadata,
  animationFrames,
  waitFor,
} from '../../../utils/test/testUtilsVideo';

const { Enums, utilities, imageLoader, eventTarget } = cornerstone3D;
const { ViewportType } = Enums;
const {
  BrushTool,
  segmentation,
  utilities: toolsUtilities,
  Enums: csToolsEnums,
} = csTools3d;
const { Labelmap } = csToolsEnums.SegmentationRepresentations;
const { DefaultHistoryMemo } = utilities.HistoryMemo;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'videoLabelmap';
const segmentationId = 'videoLabelmapSegmentation';
const WIDTH = 320;
const HEIGHT = 200;

/**
 * The fill alpha of the default labelmap style of an active segmentation,
 * as a byte: 0.5 of 255.
 */
const FILL_ALPHA_BYTE = 128;

/** The labelled block of frame 6, segment 1: columns 8 to 27, rows 16 to 39. */
const FRAME_6_BLOCK = { frame: 6, label: 1, x: [8, 28], y: [16, 40] };

/** The labelled block of frame 12, segment 2: columns 36 to 55, rows 8 to 27. */
const FRAME_12_BLOCK = { frame: 12, label: 2, x: [36, 56], y: [8, 28] };

/** Video pixels well inside each block, away from the outline. */
const INSIDE_FRAME_6 = [
  [13, 21],
  [18, 28],
  [23, 35],
];
const INSIDE_FRAME_12 = [
  [41, 13],
  [46, 18],
  [51, 23],
];

/** Video pixels far from both blocks. */
const OUTSIDE_BOTH = [
  [3, 3],
  [60, 44],
  [32, 4],
];

/** Makes a direct next video viewport in the tool group. */
function createNextViewport(renderingEngine, toolGroup) {
  testUtils.createViewports(renderingEngine, {
    width: WIDTH,
    height: HEIGHT,
    useEnableElement: true,
    orientation: null,
    viewportId: 'nextVideo',
    viewportType: ViewportType.VIDEO,
  });
  toolGroup.addViewport('nextVideo', renderingEngineId);

  return renderingEngine.getViewport('nextVideo');
}

/** Shows one frame of the test video, paused. */
async function goToFrame(next, frameNumber) {
  next.setFrameNumber(frameNumber);
  await waitFor(
    () =>
      !next.element.querySelector('video').seeking &&
      next.getFrameNumber() === frameNumber,
    10000
  );
  await animationFrames(4);
}

/** Fills a block of a labelmap image with a label. */
function fillBlock(image, { x, y, label }) {
  for (let row = y[0]; row < y[1]; row++) {
    for (let column = x[0]; column < x[1]; column++) {
      image.voxelManager.setAtIndex(row * TEST_VIDEO.width + column, label);
    }
  }
}

/**
 * Makes one labelmap image for each frame of the video, as an application
 * does, with a block on frame 6 and a block on frame 12, and adds the
 * labelmap to the viewport.
 * @returns The labelmap images, one per frame.
 */
async function addVideoLabelmap(next, { segments, voxelRepresentation } = {}) {
  const images = imageLoader.createAndCacheDerivedLabelmapImages(
    next.getImageIds(),
    voxelRepresentation ? { voxelRepresentation } : {}
  );

  fillBlock(images[FRAME_6_BLOCK.frame - 1], FRAME_6_BLOCK);
  fillBlock(images[FRAME_12_BLOCK.frame - 1], FRAME_12_BLOCK);

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: Labelmap,
        data: { imageIds: images.map((image) => image.imageId) },
      },
      ...(segments ? { config: { segments } } : {}),
    },
  ]);

  const rendered = new Promise((resolve) => {
    const onRendered = (evt) => {
      if (evt.detail.viewportId === next.id) {
        eventTarget.removeEventListener(
          csToolsEnums.Events.SEGMENTATION_RENDERED,
          onRendered
        );
        resolve(evt.detail);
      }
    };

    eventTarget.addEventListener(
      csToolsEnums.Events.SEGMENTATION_RENDERED,
      onRendered
    );
  });

  await segmentation.addSegmentationRepresentations(next.id, [
    { segmentationId, type: Labelmap },
  ]);

  const detail = await Promise.race([
    rendered,
    new Promise((resolve) => setTimeout(() => resolve(undefined), 5000)),
  ]);

  await animationFrames(4);

  return { images, renderedDetail: detail };
}

/** The canvas that the labelmap is drawn on: the layer above the video. */
function labelmapLayer(next) {
  return next.element.querySelector('video + canvas');
}

/**
 * The RGBA of the labelmap layer at the centre of a video pixel, read at
 * the canvas point that the viewport gives for it.
 */
function layerPixelAt(next, [x, y]) {
  const canvas = labelmapLayer(next);

  if (!canvas) {
    return undefined;
  }

  const ratio = canvas.width / next.element.clientWidth;
  const [canvasX, canvasY] = next.worldToCanvas([x + 0.5, y + 0.5, 0]);

  return Array.from(
    canvas
      .getContext('2d')
      .getImageData(
        Math.floor(canvasX * ratio),
        Math.floor(canvasY * ratio),
        1,
        1
      ).data
  );
}

/** The fill colour of a segment over the video, as the layer holds it. */
function fillColorOf(next, segmentIndex) {
  const [r, g, b] = segmentation.config.color.getSegmentIndexColor(
    next.id,
    segmentationId,
    segmentIndex
  );

  return [r, g, b, FILL_ALPHA_BYTE];
}

function isColor(pixel, color) {
  return (
    !!pixel &&
    pixel.every((value, index) => Math.abs(value - color[index]) <= 2)
  );
}

function isClear(pixel) {
  return !!pixel && pixel[3] === 0;
}

/** Expects the layer to show a colour at some video pixels and none at others. */
function expectLayer(next, { colored = [], color, clear = [] }) {
  expect(labelmapLayer(next))
    .withContext('a labelmap layer over the video')
    .not.toBeNull();

  colored.forEach((point) => {
    expect(isColor(layerPixelAt(next, point), color))
      .withContext(
        `video pixel ${point} shows ${layerPixelAt(next, point)}, expected ${color}`
      )
      .toBe(true);
  });
  clear.forEach((point) => {
    expect(isClear(layerPixelAt(next, point)))
      .withContext(
        `video pixel ${point} shows ${layerPixelAt(next, point)}, expected nothing`
      )
      .toBe(true);
  });
}

/** Waits until a video pixel of the layer shows a colour, or the timeout. */
function waitForLayerColor(next, point, color, timeout = 3000) {
  return waitFor(
    () => isColor(layerPixelAt(next, point), color),
    timeout
  ).catch(() => undefined);
}

/** Waits until a video pixel of the layer shows nothing, or the timeout. */
function waitForLayerClear(next, point, timeout = 3000) {
  return waitFor(() => isClear(layerPixelAt(next, point)), timeout).catch(
    () => undefined
  );
}

/** The mouse event of a point of the canvas of the viewport. */
function mouseEventAt(element, type, canvasPoint) {
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + canvasPoint[0];
  const clientY = rect.top + canvasPoint[1];

  return new MouseEvent(type, {
    clientX,
    clientY,
    pageX: clientX + window.pageXOffset,
    pageY: clientY + window.pageYOffset,
    buttons: 1,
    bubbles: true,
  });
}

/** Drags the active tool from one video point to another, in steps. */
async function strokeBetween(next, from, to, steps = 4) {
  const { element } = next;
  const toCanvas = (point) => next.worldToCanvas([point[0], point[1], 0]);

  element.dispatchEvent(mouseEventAt(element, 'mousedown', toCanvas(from)));
  await animationFrames(2);

  for (let step = 1; step <= steps; step++) {
    const point = [
      from[0] + ((to[0] - from[0]) * step) / steps,
      from[1] + ((to[1] - from[1]) * step) / steps,
    ];

    document.dispatchEvent(mouseEventAt(element, 'mousemove', toCanvas(point)));
    await animationFrames(2);
  }

  document.dispatchEvent(mouseEventAt(element, 'mouseup', toCanvas(to)));
  await new Promise((resolve) => setTimeout(resolve, 300));
  await animationFrames(4);
}

/** The label of a video pixel in a labelmap image. */
function labelAt(image, [x, y]) {
  return image.voxelManager.getAtIndex(y * TEST_VIDEO.width + x);
}

/** The number of labelled pixels of a labelmap image. */
function countLabelled(image) {
  let count = 0;

  for (let index = 0; index < TEST_VIDEO.width * TEST_VIDEO.height; index++) {
    if (image.voxelManager.getAtIndex(index)) {
      count++;
    }
  }

  return count;
}

/** The grey value of a pixel of the frame on display, as the threshold reads it. */
function frameGrayAt(next, [x, y]) {
  const { scalarData } = next.getImageData();
  const offset = (y * TEST_VIDEO.width + x) * 4;

  return Math.hypot(
    scalarData[offset],
    scalarData[offset + 1],
    scalarData[offset + 2]
  );
}

/**
 * The number of pixels of a block and the mean and maximum of each of the
 * red, green and blue values of the frame on display over it.
 */
function frameStatsOver(next, { x, y }) {
  const { scalarData } = next.getImageData();
  const sum = [0, 0, 0];
  const max = [-Infinity, -Infinity, -Infinity];
  let count = 0;

  for (let row = y[0]; row < y[1]; row++) {
    for (let column = x[0]; column < x[1]; column++) {
      const offset = (row * TEST_VIDEO.width + column) * 4;

      for (let channel = 0; channel < 3; channel++) {
        sum[channel] += scalarData[offset + channel];
        max[channel] = Math.max(max[channel], scalarData[offset + channel]);
      }
      count++;
    }
  }

  return { count, mean: sum.map((value) => value / count), max };
}

/** Expects statistics of a block of the frame on display, by channel. */
function expectFrameStats(stats, expected, frameNumber) {
  expect(stats.frameNumber).toBe(frameNumber);
  expect(stats.count.value).toBe(expected.count);
  expect(stats.mean.value.length).toBe(3);
  stats.mean.value.forEach((value, channel) =>
    expect(value).toBeCloseTo(expected.mean[channel], 6)
  );
  expect(stats.max.value).toEqual(expected.max);
}

describe('A labelmap over a direct next video viewport -- ', () => {
  let renderingEngine;
  let videoUrl;
  let next;
  let toolGroup;

  beforeEach(async function () {
    const setup = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [BrushTool],
    });

    renderingEngine = setup.renderingEngine;
    toolGroup = setup.toolGroups[toolGroupId];
    videoUrl = addTestVideoMetadata();
    next = createNextViewport(renderingEngine, toolGroup);
    await next.setDisplaySets({ displaySetId: TEST_VIDEO.imageId });
    await goToFrame(next, FRAME_6_BLOCK.frame);
  }, 15000);

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
    URL.revokeObjectURL(videoUrl);
  });

  it('draws the labelmap of the frame on display over the video, with the segment colour, the fill alpha and the outline', async function () {
    const { renderedDetail } = await addVideoLabelmap(next);

    expect(renderedDetail)
      .withContext('SEGMENTATION_RENDERED for the video viewport')
      .toEqual(
        jasmine.objectContaining({ viewportId: next.id, segmentationId })
      );
    await waitForLayerColor(next, INSIDE_FRAME_6[0], fillColorOf(next, 1));
    expectLayer(next, {
      colored: INSIDE_FRAME_6,
      color: fillColorOf(next, 1),
      clear: [...INSIDE_FRAME_12, ...OUTSIDE_BOTH],
    });

    const [edgeX, edgeY] = next.worldToCanvas([
      FRAME_6_BLOCK.x[0],
      (FRAME_6_BLOCK.y[0] + FRAME_6_BLOCK.y[1]) / 2,
      0,
    ]);
    const outline = Array.from(
      labelmapLayer(next)
        .getContext('2d')
        .getImageData(Math.ceil(edgeX) + 1, Math.floor(edgeY), 1, 1).data
    );
    const [r, g, b] = fillColorOf(next, 1);

    expect(isColor(outline, [r, g, b, 255]))
      .withContext(`outline pixel ${outline}, expected ${[r, g, b, 255]}`)
      .toBe(true);
  }, 30000);

  it('draws the labelmap of the new frame after a frame change', async function () {
    await addVideoLabelmap(next);
    await waitForLayerColor(next, INSIDE_FRAME_6[0], fillColorOf(next, 1));

    await goToFrame(next, FRAME_12_BLOCK.frame);
    await waitForLayerColor(next, INSIDE_FRAME_12[0], fillColorOf(next, 2));

    expectLayer(next, {
      colored: INSIDE_FRAME_12,
      color: fillColorOf(next, 2),
      clear: [...INSIDE_FRAME_6, ...OUTSIDE_BOTH],
    });

    await goToFrame(next, 9);
    await waitForLayerClear(next, INSIDE_FRAME_12[0]);

    expectLayer(next, {
      clear: [...INSIDE_FRAME_6, ...INSIDE_FRAME_12, ...OUTSIDE_BOTH],
    });
  }, 40000);

  it('follows the frames while the video plays', async function () {
    const { images } = await addVideoLabelmap(next);

    for (let frame = 7; frame <= TEST_VIDEO.numberOfFrames; frame++) {
      fillBlock(images[frame - 1], FRAME_6_BLOCK);
    }

    await goToFrame(next, 3);
    await waitForLayerClear(next, INSIDE_FRAME_6[0]);

    expectLayer(next, { clear: INSIDE_FRAME_6 });

    await next.play();
    await waitFor(() => next.getFrameNumber() >= 9, 10000);
    next.pause();
    await waitForLayerColor(next, INSIDE_FRAME_6[0], fillColorOf(next, 1));

    expect(next.getFrameNumber()).toBeGreaterThanOrEqual(7);
    expectLayer(next, {
      colored: INSIDE_FRAME_6,
      color: fillColorOf(next, 1),
      clear: OUTSIDE_BOTH,
    });
  }, 40000);

  it('keeps the labelmap on the pixels of the video under zoom, pan and rotation', async function () {
    await addVideoLabelmap(next);
    await waitForLayerColor(next, INSIDE_FRAME_6[0], fillColorOf(next, 1));

    next.setZoom(1.5);
    next.setPan([20, -10]);
    await animationFrames(4);

    expectLayer(next, {
      colored: INSIDE_FRAME_6,
      color: fillColorOf(next, 1),
      clear: [...INSIDE_FRAME_12, ...OUTSIDE_BOTH],
    });

    next.setViewState({ rotation: 90 });
    await animationFrames(4);

    expectLayer(next, {
      colored: INSIDE_FRAME_6,
      color: fillColorOf(next, 1),
      clear: [...INSIDE_FRAME_12, ...OUTSIDE_BOTH],
    });

    next.resetViewState();
    await animationFrames(4);

    expectLayer(next, {
      colored: INSIDE_FRAME_6,
      color: fillColorOf(next, 1),
      clear: [...INSIDE_FRAME_12, ...OUTSIDE_BOTH],
    });
  }, 30000);

  it('hides the labelmap with its visibility, also on another frame, and draws it again', async function () {
    await addVideoLabelmap(next, {
      segments: {
        1: { label: 'Segment 1' },
        2: { label: 'Segment 2' },
      },
    });
    await waitForLayerColor(next, INSIDE_FRAME_6[0], fillColorOf(next, 1));

    segmentation.config.visibility.setSegmentationRepresentationVisibility(
      next.id,
      { segmentationId, type: Labelmap },
      false
    );
    await waitForLayerClear(next, INSIDE_FRAME_6[0]);

    expectLayer(next, { clear: INSIDE_FRAME_6 });

    await goToFrame(next, FRAME_12_BLOCK.frame);
    await animationFrames(6);

    expectLayer(next, { clear: [...INSIDE_FRAME_6, ...INSIDE_FRAME_12] });

    segmentation.config.visibility.setSegmentationRepresentationVisibility(
      next.id,
      { segmentationId, type: Labelmap },
      true
    );
    await waitForLayerColor(next, INSIDE_FRAME_12[0], fillColorOf(next, 2));

    expectLayer(next, {
      colored: INSIDE_FRAME_12,
      color: fillColorOf(next, 2),
    });
  }, 30000);

  it('shows the labelmap on every animation frame while the video plays', async function () {
    const { images } = await addVideoLabelmap(next);

    for (let frame = 1; frame <= TEST_VIDEO.numberOfFrames; frame++) {
      fillBlock(images[frame - 1], FRAME_6_BLOCK);
    }

    await goToFrame(next, 2);
    await waitForLayerColor(next, INSIDE_FRAME_6[0], fillColorOf(next, 1));

    const blankFrames = [];
    const framesSeen = new Set();
    let sampling = true;
    const sample = () => {
      if (!sampling) {
        return;
      }

      framesSeen.add(next.getFrameNumber());

      if (
        !isColor(layerPixelAt(next, INSIDE_FRAME_6[1]), fillColorOf(next, 1))
      ) {
        blankFrames.push(next.getFrameNumber());
      }

      requestAnimationFrame(sample);
    };

    await next.play();
    requestAnimationFrame(sample);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    sampling = false;
    next.pause();

    expect(framesSeen.size)
      .withContext('frames shown while playing')
      .toBeGreaterThan(5);
    expect(blankFrames)
      .withContext('frames of the video that showed without their labelmap')
      .toEqual([]);
  }, 30000);

  it('paints a brush stroke into the labelmap of the frame on display, and undo takes it back', async function () {
    const { images } = await addVideoLabelmap(next);
    const modified = [];
    const onModified = (evt) => modified.push(evt.detail);

    eventTarget.addEventListener(
      csToolsEnums.Events.SEGMENTATION_DATA_MODIFIED,
      onModified
    );
    toolGroup.addToolInstance('VideoBrush', BrushTool.toolName, {
      activeStrategy: 'FILL_INSIDE_CIRCLE',
      brushSize: 3,
    });
    toolGroup.setToolActive('VideoBrush', {
      bindings: [{ mouseButton: 1 }],
    });
    segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 1);

    const before = images.map(countLabelled);

    await strokeBetween(next, [40.25, 36.25], [50.25, 36.25]);

    eventTarget.removeEventListener(
      csToolsEnums.Events.SEGMENTATION_DATA_MODIFIED,
      onModified
    );

    const frame6 = images[FRAME_6_BLOCK.frame - 1];

    [40, 43, 46, 50].forEach((x) =>
      expect(labelAt(frame6, [x, 36]))
        .withContext(`label of frame 6 at ${x}, 36`)
        .toBe(1)
    );
    expect(labelAt(frame6, [45, 20])).toBe(0);
    expect(labelAt(frame6, [30, 36])).toBe(0);
    expect(countLabelled(frame6)).toBeGreaterThan(before[5]);
    images.forEach((image, index) => {
      if (index !== FRAME_6_BLOCK.frame - 1) {
        expect(countLabelled(image))
          .withContext(`labelled pixels of frame ${index + 1}`)
          .toBe(before[index]);
      }
    });
    expect(modified.length).toBeGreaterThan(0);
    expect(modified[0].segmentationId).toBe(segmentationId);

    await waitForLayerColor(next, [46, 36], fillColorOf(next, 1));
    expectLayer(next, {
      colored: [
        [43, 36],
        [46, 36],
      ],
      color: fillColorOf(next, 1),
    });

    DefaultHistoryMemo.undo();
    await waitForLayerClear(next, [46, 36]);

    expect(countLabelled(frame6)).toBe(before[5]);
    expect(labelAt(frame6, [46, 36])).toBe(0);
    expectLayer(next, {
      colored: INSIDE_FRAME_6,
      color: fillColorOf(next, 1),
      clear: [
        [43, 36],
        [46, 36],
      ],
    });
  }, 40000);

  it('paints on another frame into the labelmap of that frame only', async function () {
    const { images } = await addVideoLabelmap(next);

    toolGroup.addToolInstance('VideoBrush', BrushTool.toolName, {
      activeStrategy: 'FILL_INSIDE_CIRCLE',
      brushSize: 3,
    });
    toolGroup.setToolActive('VideoBrush', {
      bindings: [{ mouseButton: 1 }],
    });
    await goToFrame(next, 15);
    segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 3);

    const before = images.map(countLabelled);

    await strokeBetween(next, [10.25, 10.25], [20.25, 10.25]);

    const frame15 = images[14];

    expect(labelAt(frame15, [15, 10])).toBe(3);
    images.forEach((image, index) => {
      if (index !== 14) {
        expect(countLabelled(image))
          .withContext(`labelled pixels of frame ${index + 1}`)
          .toBe(before[index]);
      }
    });
    await waitForLayerColor(next, [15, 10], fillColorOf(next, 3));
    expectLayer(next, {
      colored: [[15, 10]],
      color: fillColorOf(next, 3),
      clear: OUTSIDE_BOTH,
    });
  }, 40000);

  it('erases with the eraser strategy in the labelmap of the frame on display', async function () {
    const { images } = await addVideoLabelmap(next);

    toolGroup.addToolInstance('VideoEraser', BrushTool.toolName, {
      activeStrategy: 'ERASE_INSIDE_CIRCLE',
      brushSize: 3,
    });
    toolGroup.setToolActive('VideoEraser', {
      bindings: [{ mouseButton: 1 }],
    });

    const frame6 = images[FRAME_6_BLOCK.frame - 1];

    await strokeBetween(next, [18.25, 28.25], [18.25, 28.25], 1);

    expect(labelAt(frame6, [18, 28])).toBe(0);
    expect(labelAt(frame6, [9, 17])).toBe(1);
    await waitForLayerClear(next, [18, 28]);
    expectLayer(next, {
      colored: [[9, 38]],
      color: fillColorOf(next, 1),
      clear: [[18, 28]],
    });
  }, 30000);

  it('paints with the threshold brush only the pixels of the frame in the range', async function () {
    const { images } = await addVideoLabelmap(next);
    const center = [44, 32];
    const centerGray = frameGrayAt(next, center);
    const range = [centerGray - 2, 1000];

    toolGroup.addToolInstance('VideoThreshold', BrushTool.toolName, {
      activeStrategy: 'THRESHOLD_INSIDE_CIRCLE',
      brushSize: 5,
      threshold: { range },
      preview: { enabled: false },
    });
    toolGroup.setToolActive('VideoThreshold', {
      bindings: [{ mouseButton: 1 }],
    });
    segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 1);

    await strokeBetween(next, [44.25, 32.25], [44.25, 32.25], 1);

    const frame6 = images[FRAME_6_BLOCK.frame - 1];
    let labelled = 0;
    let outOfRange = 0;

    for (let y = 26; y <= 38; y++) {
      for (let x = 38; x <= 50; x++) {
        const gray = frameGrayAt(next, [x, y]);
        const label = labelAt(frame6, [x, y]);

        if (label) {
          labelled++;
          expect(gray)
            .withContext(`grey of labelled pixel ${x}, ${y}`)
            .toBeGreaterThanOrEqual(range[0]);
        } else if (
          gray >= range[0] &&
          Math.hypot(x - center[0], y - center[1]) <= 3
        ) {
          outOfRange++;
        }
      }
    }

    expect(labelAt(frame6, center)).toBe(1);
    expect(labelled).toBeGreaterThan(3);
    expect(outOfRange)
      .withContext('pixels in the range near the centre that stay empty')
      .toBe(0);
  }, 30000);

  it('gives the segment indices of the labelmap of the video', async function () {
    await addVideoLabelmap(next, {
      segments: {
        1: { label: 'Segment 1' },
        2: { label: 'Segment 2' },
      },
    });

    expect(
      toolsUtilities.segmentation.getUniqueSegmentIndices(segmentationId)
    ).toEqual([1, 2]);
  }, 30000);

  it('gives the statistics of a segment over the pixels of the frame on display, red, green and blue apart', async function () {
    await addVideoLabelmap(next, {
      segments: {
        1: { label: 'Segment 1' },
        2: { label: 'Segment 2' },
      },
    });

    const getStatistics = toolsUtilities.segmentation.getStatistics;
    const frame6 = await getStatistics({ segmentationId, segmentIndices: 1 });

    expectFrameStats(
      frame6,
      frameStatsOver(next, FRAME_6_BLOCK),
      FRAME_6_BLOCK.frame
    );
    expect(frame6.count.value).toBe(20 * 24);

    await goToFrame(next, FRAME_12_BLOCK.frame);

    const frame12 = await getStatistics({
      segmentationId,
      segmentIndices: [1, 2],
      mode: 'individual',
    });

    expectFrameStats(
      frame12[2],
      frameStatsOver(next, FRAME_12_BLOCK),
      FRAME_12_BLOCK.frame
    );
    expect(frame12[2].count.value).toBe(20 * 20);
  }, 30000);

  it('says that the statistics of a labelmap over a video need a video viewport that shows it', async function () {
    await addVideoLabelmap(next);
    segmentation.removeSegmentationRepresentations(next.id, {
      segmentationId,
    });

    await expectAsync(
      toolsUtilities.segmentation.getStatistics({
        segmentationId,
        segmentIndices: 1,
      })
    ).toBeRejectedWithError(/needs? a video viewport that shows/);
  }, 30000);

  it('draws and paints a labelmap of RLE images, one per frame', async function () {
    const { images } = await addVideoLabelmap(next, {
      voxelRepresentation: Enums.VoxelManagerEnum.RLE,
    });

    await waitForLayerColor(next, INSIDE_FRAME_6[0], fillColorOf(next, 1));
    expectLayer(next, {
      colored: INSIDE_FRAME_6,
      color: fillColorOf(next, 1),
      clear: [...INSIDE_FRAME_12, ...OUTSIDE_BOTH],
    });

    toolGroup.addToolInstance('VideoBrush', BrushTool.toolName, {
      activeStrategy: 'FILL_INSIDE_CIRCLE',
      brushSize: 3,
    });
    toolGroup.setToolActive('VideoBrush', {
      bindings: [{ mouseButton: 1 }],
    });
    segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 1);

    await strokeBetween(next, [40.25, 36.25], [50.25, 36.25]);

    expect(labelAt(images[FRAME_6_BLOCK.frame - 1], [46, 36])).toBe(1);
    expect(labelAt(images[FRAME_6_BLOCK.frame - 2], [46, 36])).toBe(0);
    await waitForLayerColor(next, [46, 36], fillColorOf(next, 1));
    expectLayer(next, {
      colored: [[46, 36], ...INSIDE_FRAME_6],
      color: fillColorOf(next, 1),
    });

    await goToFrame(next, FRAME_12_BLOCK.frame);
    await waitForLayerColor(next, INSIDE_FRAME_12[0], fillColorOf(next, 2));
    expectLayer(next, {
      colored: INSIDE_FRAME_12,
      color: fillColorOf(next, 2),
      clear: [[46, 36], ...INSIDE_FRAME_6],
    });
  }, 40000);

  it('reads the segment at a point of the frame on display', async function () {
    await addVideoLabelmap(next);

    const segmentAt = (point) =>
      toolsUtilities.segmentation.getSegmentIndexAtWorldPoint(
        segmentationId,
        [point[0] + 0.25, point[1] + 0.25, 0],
        { viewport: next }
      );

    expect(segmentAt(INSIDE_FRAME_6[1])).toBe(1);
    expect(segmentAt(INSIDE_FRAME_12[1])).toBeFalsy();

    await goToFrame(next, FRAME_12_BLOCK.frame);

    expect(segmentAt(INSIDE_FRAME_12[1])).toBe(2);
    expect(segmentAt(INSIDE_FRAME_6[1])).toBeFalsy();
  }, 30000);
});
