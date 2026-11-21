import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  TEST_VIDEO,
  addTestVideoMetadata,
  animationFrames,
  waitFor,
} from '../../../utils/test/testUtilsVideo';

const { Enums, utilities, imageLoader } = cornerstone3D;
const { ViewportType } = Enums;

const renderingEngineId = utilities.uuidv4();
const WIDTH = 320;
const HEIGHT = 200;

/** The colour of label 1 in the tests: green, with the alpha 0.6. */
const LABEL_COLOR = [0, 255, 0, 153];

/** The labelled block of the image over the video: columns 20 to 39, rows 10 to 29. */
const BLOCK = { x: [20, 40], y: [10, 30] };

/** Makes a direct next video viewport of the size of the tests. */
function createViewport(renderingEngine) {
  testUtils.createViewports(renderingEngine, {
    width: WIDTH,
    height: HEIGHT,
    useEnableElement: true,
    orientation: null,
    viewportId: 'nextVideo',
    viewportType: ViewportType.VIDEO,
  });

  return renderingEngine.getViewport('nextVideo');
}

/** Shows the test video on its first frame, paused. */
async function showVideo(next) {
  await next.setDisplaySets({ displaySetId: TEST_VIDEO.imageId });
  await waitFor(
    () =>
      next.element.querySelector('video').readyState >= 2 &&
      !next.element.querySelector('video').seeking
  );
  await animationFrames(3);
}

/** A labelmap image of the size of the video with the block labelled 1. */
function createBlockImage() {
  const image = imageLoader.createAndCacheDerivedLabelmapImage(
    TEST_VIDEO.imageId
  );

  for (let row = BLOCK.y[0]; row < BLOCK.y[1]; row++) {
    for (let column = BLOCK.x[0]; column < BLOCK.x[1]; column++) {
      image.voxelManager.setAtIndex(row * TEST_VIDEO.width + column, 1);
    }
  }

  return image;
}

/** Gives a canvas actor the colour of the tests for label 1, as the tools do. */
function colorActor(actor) {
  const colors = vtkColorTransferFunction.newInstance();
  const opacities = vtkPiecewiseFunction.newInstance();

  colors.addRGBPoint(0, 0, 0, 0);
  colors.addRGBPoint(1, 0, 1, 0);
  opacities.addPoint(0, 0);
  opacities.addPoint(1, 0.6);
  actor.getProperty().setRGBTransferFunction(0, colors);
  actor.getProperty().setScalarOpacity(0, opacities);
}

/** The RGBA of the canvas above the video at the centre of a video pixel. */
function overlayPixelAt(next, [x, y]) {
  const canvas = next.element.querySelector('video + canvas');

  if (!canvas) {
    return undefined;
  }

  const [canvasX, canvasY] = next.worldToCanvas([x + 0.5, y + 0.5, 0]);

  return Array.from(
    canvas
      .getContext('2d')
      .getImageData(Math.floor(canvasX), Math.floor(canvasY), 1, 1).data
  );
}

function expectOverlay(next, { inside, outside }) {
  inside.forEach((point) => {
    const pixel = overlayPixelAt(next, point);

    expect(
      !!pixel &&
        pixel.every((value, index) => Math.abs(value - LABEL_COLOR[index]) <= 2)
    )
      .withContext(
        `video pixel ${point} shows ${pixel}, expected ${LABEL_COLOR}`
      )
      .toBe(true);
  });
  outside.forEach((point) => {
    const pixel = overlayPixelAt(next, point);

    expect(!!pixel && pixel[3] === 0)
      .withContext(`video pixel ${point} shows ${pixel}, expected nothing`)
      .toBe(true);
  });
}

const INSIDE = [
  [25, 15],
  [30, 20],
  [35, 25],
];
const OUTSIDE = [
  [5, 5],
  [50, 40],
  [30, 35],
];

describe('Images over a direct next video viewport -- ', () => {
  let renderingEngine;
  let videoUrl;
  let next;

  beforeEach(async function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });

    renderingEngine = testEnv.renderingEngine;
    videoUrl = addTestVideoMetadata();
    next = createViewport(renderingEngine);
    await showVideo(next);
  }, 15000);

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    URL.revokeObjectURL(videoUrl);
  });

  it('puts the video just above the viewport canvas, in the layer that holds the canvas', function () {
    const video = next.element.querySelector('video');

    expect(video.parentElement).toBe(next.canvas.parentElement);
    expect(video.previousElementSibling).toBe(next.canvas);
  });

  it('lists, draws and removes an image over the video', async function () {
    const image = createBlockImage();

    expect(next.getActors()).toEqual([]);

    next.addImages([{ imageId: image.imageId, dataId: 'blockOverlay' }]);

    const actors = next.getActors();

    expect(actors.length).toBe(1);
    expect(actors[0]).toEqual(
      jasmine.objectContaining({
        uid: 'blockOverlay',
        referencedId: image.imageId,
      })
    );
    expect(actors[0].actorMapper.renderMode).toBe(
      cornerstone3D.ActorRenderMode.CPU_IMAGE
    );

    colorActor(actors[0].actor);
    next.render();
    await animationFrames(3);

    expect(next.element.querySelector('video + canvas'))
      .withContext('a canvas just above the video')
      .not.toBeNull();
    expectOverlay(next, { inside: INSIDE, outside: OUTSIDE });

    next.setZoom(2, next.worldToCanvas([30, 20, 0]));
    next.setPan([-15, 10]);
    await animationFrames(3);

    expectOverlay(next, { inside: INSIDE, outside: OUTSIDE });

    next.removeData('blockOverlay');
    await animationFrames(3);

    expect(next.getActors()).toEqual([]);
    expectOverlay(next, { inside: [], outside: [...INSIDE, ...OUTSIDE] });
  }, 20000);
});
