import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import * as renderToCanvas_gpu_setStack from './groundTruth/renderToCanvas_gpu_setStack.png';
import * as renderToCanvas_gpu_canvas from './groundTruth/renderToCanvas_gpu_canvas.png';
import * as renderToCanvas_gpu_setStack_color from './groundTruth/renderToCanvas_gpu_setStack_color.png';
import * as renderToCanvas_gpu_canvas_color from './groundTruth/renderToCanvas_gpu_canvas_color.png';

const { cache, RenderingEngine, utilities, imageLoader, metaData, Enums } =
  cornerstone3D;

const { Events, ViewportType, InterpolationType } = Enums;

const { fakeImageLoader, fakeMetaDataProvider, compareImages } = testUtils;

const renderingEngineId = utilities.uuidv4();

const viewportId = 'VIEWPORT';

const AXIAL = 'AXIAL';

function createViewport(renderingEngine, orientation, width, height) {
  const element = document.createElement('div');

  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  document.body.appendChild(element);

  renderingEngine.setViewports([
    {
      viewportId: viewportId,
      type: ViewportType.STACK,
      element,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
      },
    },
  ]);
  return element;
}

describe('renderToCanvas -- GPU', () => {
  beforeAll(() => {
    window.devicePixelRatio = 1;
    cornerstone3D.setUseCPURendering(false);
  });
  beforeEach(function () {
    cache.purgeCache();
    this.DOMElements = [];

    this.renderingEngine = new RenderingEngine(renderingEngineId);
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
  });

  afterEach(function () {
    cache.purgeCache();
    this.renderingEngine.destroy();
    metaData.removeProvider(fakeMetaDataProvider);
    imageLoader.unregisterAllImageLoaders();
    this.DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
  });

  it('Should render two viewports one with setStack and one with renderToCanvas', function (done) {
    const width = 256;
    const height = 256;
    const element = createViewport(this.renderingEngine, AXIAL, width, height);
    this.DOMElements.push(element);
    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    document.body.appendChild(canvas);
    this.DOMElements.push(canvas);

    // imageId : imageLoaderScheme: imageURI_rows_columns_barStart_barWidth_xSpacing_ySpacing_rgbFlag
    const imageId = 'fakeImageLoader:imageURI_64_64_20_5_1_1_0';

    const vp = this.renderingEngine.getViewport(viewportId);
    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const image = vp.getCanvas().toDataURL('image/png');
      compareImages(
        image,
        renderToCanvas_gpu_setStack,
        'renderToCanvas_gpu_setStack'
      ).then(() => null, done.fail);

      // compare the other canvas as well
      const image2 = canvas.toDataURL('image/png');

      compareImages(
        image2,
        renderToCanvas_gpu_canvas,
        'renderToCanvas_gpu_canvas'
      ).then(done, done.fail);
    });

    try {
      utilities
        .loadImageToCanvas({ canvas, imageId, viewportOptions: {} })
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

  // fit('Should render exact pixel image with scale 1', function (done) {
  //   const width = 256;
  //   const height = 256;
  //   const element = createViewport(this.renderingEngine, AXIAL, width, height);
  //   this.DOMElements.push(element);
  //   const canvas = document.createElement('canvas');

  //   canvas.width = width;
  //   canvas.height = height;

  //   document.body.appendChild(canvas);
  //   this.DOMElements.push(canvas);

  //   // imageId : imageLoaderScheme: imageURI_rows_columns_barStart_barWidth_xSpacing_ySpacing_rgbFlag
  //   const imageId = 'fakeImageLoader:imageURI_64_64_20_5_1_1_0';

  //   const vp = this.renderingEngine.getViewport(viewportId);
  //   element.addEventListener(Events.IMAGE_RENDERED, () => {
  //     const image = vp.getCanvas().toDataURL('image/png');
  //     compareImages(
  //       image,
  //       renderToCanvas_gpu_setStack,
  //       'renderToCanvas_gpu_setStack'
  //     ).then(() => null, done.fail);

  //     // compare the other canvas as well
  //     const image2 = canvas.toDataURL('image/png');

  //     console.warn('Canvas image', image2);
  //     compareImages(
  //       image2,
  //       renderToCanvas_gpu_canvas,
  //       'renderToCanvas_gpu_canvas'
  //     ).then(done, done.fail);
  //   });

  //   try {
  //     utilities
  //       .loadImageToCanvas({
  //         canvas,
  //         imageId,
  //         viewportOptions: { displayArea: { type: 'SCALE', scale: 1 } },
  //       })
  //       .then(() => {
  //         vp.setStack([imageId], 0).then(() => {
  //           vp.setProperties({ interpolationType: InterpolationType.NEAREST });
  //           vp.render();
  //         });
  //       });
  //   } catch (e) {
  //     done.fail(e);
  //   }
  // });

  it('Should render two viewports one with setStack and one with renderToCanvas: color images', function (done) {
    const width = 256;
    const height = 256;
    const element = createViewport(this.renderingEngine, AXIAL, width, height);
    this.DOMElements.push(element);
    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    document.body.appendChild(canvas);
    this.DOMElements.push(canvas);

    // imageId : imageLoaderScheme: imageURI_rows_columns_barStart_barWidth_xSpacing_ySpacing_rgbFlag
    const imageId = 'fakeImageLoader:imageURI_100_100_0_10_1_1_1';

    const vp = this.renderingEngine.getViewport(viewportId);
    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const image = vp.getCanvas().toDataURL('image/png');

      compareImages(
        image,
        renderToCanvas_gpu_setStack_color,
        'renderToCanvas_gpu_setStack_color'
      );

      // compare the other canvas as well
      const image2 = canvas.toDataURL('image/png');

      compareImages(
        image2,
        renderToCanvas_gpu_canvas_color,
        'renderToCanvas_gpu_canvas_color'
      ).then(done, done.fail);
    });

    try {
      utilities
        .loadImageToCanvas({ canvas, imageId, viewportOptions: {} })
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
