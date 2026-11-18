import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { utilities, volumeLoader, Enums } = cornerstone3D;
const { Events, ViewportType, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();
const viewportId = 'VIEWPORT';
const CANVAS_SIZE = 256;

/**
 * Renders the viewport and resolves with the picture of its canvas at the
 * next IMAGE_RENDERED event.
 */
function renderAndCapture(viewport, element) {
  return new Promise((resolve) => {
    const onRendered = () => {
      element.removeEventListener(Events.IMAGE_RENDERED, onRendered);
      resolve(viewport.getCanvas().toDataURL('image/png'));
    };

    element.addEventListener(Events.IMAGE_RENDERED, onRendered);
    viewport.render();
  });
}

/**
 * Makes a canvas of the size of the viewports and adds it to the page.
 */
function createCanvas() {
  const canvas = document.createElement('canvas');

  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  document.body.appendChild(canvas);

  return canvas;
}

/**
 * Makes a volume of the fake volume loader with five slices of 100 by 100
 * pixels. Each slice has its bar at another place.
 */
async function createVolume() {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURI',
    rows: 100,
    columns: 100,
    slices: 5,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  return volumeId;
}

describe('loadImageToCanvas -- GPU', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
    });
    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
    });
  });

  it('draws the slice of a view reference of a volume as a planar viewport draws it', async function () {
    const element = testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.PLANAR_NEXT,
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      viewportId,
      orientation: OrientationAxis.AXIAL,
    });
    const viewport = renderingEngine.getViewport(viewportId);
    const volumeId = await createVolume();

    await testUtils.setVolumesOnNextViewport(viewport, [volumeId]);
    viewport.setDisplayArea({ imageArea: [1, 1] });

    const middleSlice = await renderAndCapture(viewport, element);

    await viewport.setImageIdIndex(0);

    const firstSlice = await renderAndCapture(viewport, element);
    const canvas = createCanvas();

    await utilities.loadImageToCanvas({
      canvas,
      imageId: null,
      viewReference: viewport.getViewReference(),
      renderingEngineId,
      viewportOptions: { orientation: OrientationAxis.AXIAL },
    });

    const drawn = canvas.toDataURL('image/png');

    await testUtils.compareImagesToImage(
      drawn,
      firstSlice,
      'loadImageToCanvas_gpu_volume_first_slice'
    );
    await expectAsync(
      testUtils.compareImagesToImage(
        drawn,
        middleSlice,
        'loadImageToCanvas_gpu_volume_middle_slice'
      )
    ).toBeRejected();
  });

  it('draws the middle slice of a volume without a slice in the view reference', async function () {
    const element = testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.PLANAR_NEXT,
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      viewportId,
      orientation: OrientationAxis.AXIAL,
    });
    const viewport = renderingEngine.getViewport(viewportId);
    const volumeId = await createVolume();

    await testUtils.setVolumesOnNextViewport(viewport, [volumeId]);
    viewport.setDisplayArea({ imageArea: [1, 1] });

    const middleSlice = await renderAndCapture(viewport, element);
    const canvas = createCanvas();

    await utilities.loadImageToCanvas({
      canvas,
      imageId: null,
      viewReference: { volumeId },
      renderingEngineId,
      viewportOptions: { orientation: OrientationAxis.AXIAL },
    });

    await testUtils.compareImagesToImage(
      canvas.toDataURL('image/png'),
      middleSlice,
      'loadImageToCanvas_gpu_volume_middle'
    );
  });

  it('draws a PET image that is not scaled with the window of its pixel range', async function () {
    const element = testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.PLANAR_NEXT,
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      viewportId,
    });
    const viewport = renderingEngine.getViewport(viewportId);
    const imageId = testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'imageURI',
      rows: 64,
      columns: 64,
      barStart: 20,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      PT: 1,
      sliceIndex: 0,
    });

    await testUtils.setStackOnNextViewport(viewport, [imageId], 0);
    viewport.setDisplayArea({ imageArea: [1, 1] });

    const defaultWindow = await renderAndCapture(viewport, element);

    viewport.setDisplaySetPresentation({ voiRange: { lower: 0, upper: 255 } });

    const pixelRangeWindow = await renderAndCapture(viewport, element);
    const canvas = createCanvas();

    await utilities.loadImageToCanvas({
      canvas,
      imageId,
      renderingEngineId,
    });

    const drawn = canvas.toDataURL('image/png');

    await testUtils.compareImagesToImage(
      drawn,
      pixelRangeWindow,
      'loadImageToCanvas_gpu_pet_pixel_range'
    );
    await expectAsync(
      testUtils.compareImagesToImage(
        drawn,
        defaultWindow,
        'loadImageToCanvas_gpu_pet_default_window'
      )
    ).toBeRejected();
  });
});
