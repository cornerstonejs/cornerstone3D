import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import * as renderToCanvas_gpu_setStack from './groundTruth/renderToCanvas_gpu_setStack.png';
import * as renderToCanvas_gpu_canvas from './groundTruth/renderToCanvas_gpu_canvas.png';
import * as renderToCanvas_gpu_setStack_color from './groundTruth/renderToCanvas_gpu_setStack_color.png';
import * as renderToCanvas_gpu_canvas_color from './groundTruth/renderToCanvas_gpu_canvas_color.png';
import {
  encodeImageIdInfo,
  createViewports,
} from '../../../utils/test/testUtils';

const { cache, utilities, imageLoader, metaData, Enums } = cornerstone3D;

const { Events, ViewportType, InterpolationType } = Enums;

const {
  fakeImageLoader,
  fakeMetaDataProvider,
  compareImages,
  setupTestEnvironment,
  cleanupTestEnvironment,
} = testUtils;

const renderingEngineId = utilities.uuidv4();

const viewportId = 'VIEWPORT';

const AXIAL = 'AXIAL';

describe('renderToCanvas -- GPU', () => {
  let renderingEngine;
  beforeEach(function () {
    const testEnv = setupTestEnvironment({
      renderingEngineId,
    });
    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    cleanupTestEnvironment({
      renderingEngineId,
    });
  });

  it('Should render two viewports one with setStack and one with renderToCanvas', function (done) {
    const width = 256;
    const height = 256;
    const element = createViewports(renderingEngine, {
      viewportType: ViewportType.STACK,
      width,
      height,
      viewportId,
    });
    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    document.body.appendChild(canvas);

    const imageInfo = {
      loader: 'fakeImageLoader',
      name: 'imageURI',
      rows: 64,
      columns: 64,
      barStart: 20,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex: 0,
    };

    const imageId = encodeImageIdInfo(imageInfo);

    const vp = renderingEngine.getViewport(viewportId);
    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const image = vp.getCanvas().toDataURL('image/png');
      compareImages(
        image,
        renderToCanvas_gpu_setStack,
        'renderToCanvas_gpu_setStack'
      ).then(() => null, done.fail);

      const image2 = canvas.toDataURL('image/png');

      compareImages(
        image2,
        renderToCanvas_gpu_canvas,
        'renderToCanvas_gpu_canvas'
      ).then(done, done.fail);
    });

    try {
      utilities
        .loadImageToCanvas({
          canvas,
          imageId,
          renderingEngineId,
          viewportOptions: { displayArea: {} },
        })
        .then(() => {
          vp.setStack([imageId], 0).then(() => {
            vp.setProperties({ interpolationType: InterpolationType.NEAREST });
            vp.render();
          });
        });
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should render two viewports one with setStack and one with renderToCanvas: color images', function (done) {
    const width = 256;
    const height = 256;
    const element = createViewports(renderingEngine, {
      viewportType: ViewportType.STACK,
      width,
      height,
      viewportId,
    });
    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    document.body.appendChild(canvas);

    const imageInfo = {
      loader: 'fakeImageLoader',
      name: 'imageURI',
      rows: 100,
      columns: 100,
      barStart: 0,
      barWidth: 10,
      xSpacing: 1,
      ySpacing: 1,
      rgb: 1,
    };

    const imageId = encodeImageIdInfo(imageInfo);

    const vp = renderingEngine.getViewport(viewportId);
    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const image = vp.getCanvas().toDataURL('image/png');

      compareImages(
        image,
        renderToCanvas_gpu_setStack_color,
        'renderToCanvas_gpu_setStack_color'
      );

      const image2 = canvas.toDataURL('image/png');

      compareImages(
        image2,
        renderToCanvas_gpu_canvas_color,
        'renderToCanvas_gpu_canvas_color'
      ).then(done, done.fail);
    });

    try {
      utilities
        .loadImageToCanvas({
          canvas,
          imageId,
          renderingEngineId,
          viewportOptions: { displayArea: {} },
        })
        .then(() => {
          vp.setStack([imageId], 0).then(() => {
            vp.setProperties({ interpolationType: InterpolationType.NEAREST });
            vp.render();
          });
        });
    } catch (e) {
      done.fail(e);
    }
  });
});
