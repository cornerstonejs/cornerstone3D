import * as cornerstone3D from '../src/index';
import * as csTools3d from '../../tools/src/index';
import * as testUtils from '../../../utils/test/testUtils';

// nearest neighbor interpolation
import * as imageURI_64_33_20_5_1_1_0_nearest from './groundTruth/imageURI_64_33_20_5_1_1_0_nearest.png';
import * as imageURI_64_64_20_5_1_1_0_nearest from './groundTruth/imageURI_64_64_20_5_1_1_0_nearest.png';
import * as imageURI_64_64_30_10_5_5_0_nearest from './groundTruth/imageURI_64_64_30_10_5_5_0_nearest.png';
import * as imageURI_256_256_100_100_1_1_0_nearest from './groundTruth/imageURI_256_256_100_100_1_1_0_nearest.png';
import * as imageURI_256_256_100_100_1_1_0_CT_nearest from './groundTruth/imageURI_256_256_100_100_1_1_0_CT_nearest.png';
import * as imageURI_64_64_54_10_5_5_0_nearest from './groundTruth/imageURI_64_64_54_10_5_5_0_nearest.png';
import * as imageURI_64_64_0_10_5_5_0_nearest from './groundTruth/imageURI_64_64_0_10_5_5_0_nearest.png';
import * as imageURI_100_100_0_10_1_1_1_nearest_color from './groundTruth/imageURI_100_100_0_10_1_1_1_nearest_color.png';
import * as imageURI_11_11_4_1_1_1_0_nearest_invert_90deg from './groundTruth/imageURI_11_11_4_1_1_1_0_nearest_invert_90deg.png';
import * as imageURI_64_64_20_5_1_1_0_nearestFlipH from './groundTruth/imageURI_64_64_20_5_1_1_0_nearestFlipH.png';
import * as imageURI_64_64_20_5_1_1_0_nearestFlipHRotate90 from './groundTruth/imageURI_64_64_20_5_1_1_0_nearestFlipHRotate90.png';

// linear interpolation
import * as imageURI_11_11_4_1_1_1_0 from './groundTruth/imageURI_11_11_4_1_1_1_0.png';
import * as imageURI_256_256_50_10_1_1_0 from './groundTruth/imageURI_256_256_50_10_1_1_0.png';
import * as imageURI_100_100_0_10_1_1_1_linear_color from './groundTruth/imageURI_100_100_0_10_1_1_1_linear_color.png';
import * as calibrated_1_5_imageURI_11_11_4_1_1_1_0_1 from './groundTruth/calibrated_1_5_imageURI_11_11_4_1_1_1_0_1.png';

// import { User } from ... doesn't work right now since we don't have named exports set up
const {
  utilities: { calibrateImageSpacing },
} = csTools3d;

const { cache, RenderingEngine, utilities, imageLoader, metaData, Enums } =
  cornerstone3D;

const { Events, ViewportType, InterpolationType } = Enums;
const { calibratedPixelSpacingMetadataProvider } = utilities;

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

describe('renderingCore -- Stack', () => {
  beforeAll(() => {
    window.devicePixelRatio = 1;

    // initialize cornerstone
    cornerstone3D.setUseCPURendering(false);
  });
  describe('Stack Viewport Nearest Neighbor Interpolation --- ', function () {
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

    it('Should render one stack viewport of square size properly: nearest', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);
      // imageId : imageLoaderScheme: imageURI_rows_columns_barStart_barWidth_xSpacing_ySpacing_rgbFlag
      const imageId = 'fakeImageLoader:imageURI_64_64_20_5_1_1_0';

      const vp = this.renderingEngine.getViewport(viewportId);
      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          imageURI_64_64_20_5_1_1_0_nearest,
          'imageURI_64_64_20_5_1_1_0_nearest'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId], 0).then(() => {
          vp.setProperties({ interpolationType: InterpolationType.NEAREST });
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should render one stack viewport of rectangle size properly: nearest', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageId = 'fakeImageLoader:imageURI_64_33_20_5_1_1_0';

      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          imageURI_64_33_20_5_1_1_0_nearest,
          'imageURI_64_33_20_5_1_1_0_nearest'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId], 0).then(() => {
          vp.setProperties({ interpolationType: InterpolationType.NEAREST });
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should render one stack viewport of square size and 5mm spacing properly: nearest', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageId = 'fakeImageLoader:imageURI_64_64_30_10_5_5_0';

      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          imageURI_64_64_30_10_5_5_0_nearest,
          'imageURI_64_64_30_10_5_5_0_nearest'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId], 0).then(() => {
          vp.setProperties({ interpolationType: InterpolationType.NEAREST });
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should use enableElement API to render one stack viewport of square size and 5mm spacing properly: nearest', function (done) {
      const element = document.createElement('div');
      this.DOMElements.push(element);

      element.style.width = `256px`;
      element.style.height = `256px`;
      document.body.appendChild(element);

      const imageId = 'fakeImageLoader:imageURI_64_64_30_10_5_5_0';

      this.renderingEngine.enableElement({
        viewportId: viewportId,
        type: ViewportType.STACK,
        element: element,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
        },
      });

      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          imageURI_64_64_30_10_5_5_0_nearest,
          'imageURI_64_64_30_10_5_5_0_nearest'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId], 0).then(() => {
          vp.setProperties({ interpolationType: InterpolationType.NEAREST });
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should render one stack viewport, first slice correctly: nearest', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_64_64_0_10_5_5_0';
      const imageId2 = 'fakeImageLoader:imageURI_64_64_10_20_5_5_0';
      const imageId3 = 'fakeImageLoader:imageURI_64_64_20_30_5_5_0';

      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          imageURI_64_64_0_10_5_5_0_nearest,
          'imageURI_64_64_0_10_5_5_0_nearest'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId1, imageId2, imageId3], 0).then(() => {
          vp.setProperties({ interpolationType: InterpolationType.NEAREST });
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should render one stack viewport, last slice correctly: nearest', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_64_64_0_10_5_5_0';
      const imageId2 = 'fakeImageLoader:imageURI_64_64_10_20_5_5_0';
      const imageId3 = 'fakeImageLoader:imageURI_64_64_54_10_5_5_0';

      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          imageURI_64_64_54_10_5_5_0_nearest,
          'imageURI_64_64_54_10_5_5_0_nearest'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId1, imageId2, imageId3], 2).then(() => {
          vp.setProperties({ interpolationType: InterpolationType.NEAREST });
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should render one stack viewport with CT presets correctly: nearest', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageId = 'fakeImageLoader:imageURI_256_256_100_100_1_1_0';

      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          imageURI_256_256_100_100_1_1_0_CT_nearest,
          'imageURI_256_256_100_100_1_1_0_CT_nearest'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId], 0).then(() => {
          vp.setProperties({
            voiRange: { lower: -160, upper: 240 },
            interpolationType: InterpolationType.NEAREST,
          });
        });

        vp.render();
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should render one stack viewport with multiple imageIds of different size and different spacing: nearest', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_256_256_100_100_1_1_0';
      const imageId2 = 'fakeImageLoader:imageURI_64_64_30_10_5_5_0';

      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          imageURI_256_256_100_100_1_1_0_nearest,
          'imageURI_256_256_100_100_1_1_0_nearest'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId1, imageId2], 0).then(() => {
          vp.setProperties({ interpolationType: InterpolationType.NEAREST });
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should render one stack viewport with multiple imageIds of different size and different spacing, second slice: nearest', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_256_256_100_100_1_1_0';
      const imageId2 = 'fakeImageLoader:imageURI_64_64_30_10_5_5_0';

      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          imageURI_64_64_30_10_5_5_0_nearest,
          'imageURI_64_64_30_10_5_5_0_nearest'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId1, imageId2], 1).then(() => {
          vp.setProperties({ interpolationType: InterpolationType.NEAREST });
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });
  });

  describe('Stack Viewport Linear Interpolation --- ', () => {
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

    it('Should render one stack viewport with linear interpolation correctly', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_11_11_4_1_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);
      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          imageURI_11_11_4_1_1_1_0,
          'imageURI_11_11_4_1_1_1_0'
        ).then(done, done.fail);
      });
      try {
        vp.setStack([imageId1], 0).then(() => {
          vp.setProperties({ voiRange: { lower: -160, upper: 240 } });
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should render one stack viewport with multiple images with linear interpolation correctly', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_11_11_4_1_1_1_0';
      const imageId2 = 'fakeImageLoader:imageURI_256_256_50_10_1_1_0';

      const vp = this.renderingEngine.getViewport(viewportId);
      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          imageURI_256_256_50_10_1_1_0,
          'imageURI_256_256_50_10_1_1_0'
        ).then(done, done.fail);
      });
      try {
        vp.setStack([imageId1, imageId2], 1).then(() => {
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });
  });

  describe('Color Stack Images', () => {
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

    it('Should render color images: linear', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 512, 512);
      this.DOMElements.push(element);

      // color image generation with 10 strips of different colors
      const imageId1 = 'fakeImageLoader:imageURI_100_100_0_10_1_1_1';
      const vp = this.renderingEngine.getViewport(viewportId);
      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          imageURI_100_100_0_10_1_1_1_linear_color,
          'imageURI_100_100_0_10_1_1_1_linear_color'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId1], 0).then(() => {
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should render color images: nearest', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 512, 512);
      this.DOMElements.push(element);

      // color image generation with 10 strips of different colors
      const imageId1 = 'fakeImageLoader:imageURI_100_100_0_10_1_1_1';
      const vp = this.renderingEngine.getViewport(viewportId);
      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          imageURI_100_100_0_10_1_1_1_nearest_color,
          'imageURI_100_100_0_10_1_1_1_nearest_color'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId1], 0).then(() => {
          vp.setProperties({ interpolationType: InterpolationType.NEAREST });
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });
  });

  describe('Stack Viewport Calibration and Scaling --- ', () => {
    beforeEach(function () {
      cache.purgeCache();
      this.DOMElements = [];

      this.renderingEngine = new RenderingEngine(renderingEngineId);
      imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
      metaData.addProvider(fakeMetaDataProvider, 10000);
      metaData.addProvider(
        calibratedPixelSpacingMetadataProvider.get.bind(
          calibratedPixelSpacingMetadataProvider
        ),
        11000
      );
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

    it('Should be able to render a stack viewport with PET modality scaling', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_11_11_4_1_1_1_0_1';

      const vp = this.renderingEngine.getViewport(viewportId);
      element.addEventListener(Events.IMAGE_RENDERED, () => {
        expect(vp.scaling.PT).toEqual({
          suvbwToSuvlbm: 1,
          suvbwToSuvbsa: 1,
        });
        done();
      });
      try {
        vp.setStack([imageId1], 0);
        vp.render();
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should be able to calibrate the pixel spacing', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_11_11_4_1_1_1_0';

      const vp = this.renderingEngine.getViewport(viewportId);

      const imageRenderedCallback = () => {
        calibratedPixelSpacingMetadataProvider.add(imageId1, {
          scale: 0.5,
        });

        vp.calibrateSpacing(imageId1);
        element.removeEventListener(
          Events.IMAGE_RENDERED,
          imageRenderedCallback
        );
        element.addEventListener(
          Events.IMAGE_RENDERED,
          secondImageRenderedCallbackAfterCalibration
        );
      };

      const secondImageRenderedCallbackAfterCalibration = () => {
        done();
      };

      element.addEventListener(Events.IMAGE_RENDERED, imageRenderedCallback);

      element.addEventListener(Events.IMAGE_SPACING_CALIBRATED, (evt) => {
        const { calibration } = evt.detail;
        expect(calibration?.scale).toBe(0.5);
      });

      try {
        vp.setStack([imageId1], 0);
        vp.render();
      } catch (e) {
        done.fail(e);
      }
    });
  });

  describe('Stack Viewport setProperties API --- ', () => {
    beforeEach(function () {
      cache.purgeCache();
      this.DOMElements = [];

      this.renderingEngine = new RenderingEngine(renderingEngineId);
      imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
      metaData.addProvider(fakeMetaDataProvider, 10000);
      metaData.addProvider(
        calibratedPixelSpacingMetadataProvider.get.bind(
          calibratedPixelSpacingMetadataProvider
        ),
        11000
      );
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

    it('Should be able to use setProperties API', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_11_11_4_1_1_1_0';

      const vp = this.renderingEngine.getViewport(viewportId);

      const subscribeToImageRendered = () => {
        element.addEventListener(Events.IMAGE_RENDERED, (evt) => {
          const canvas = vp.getCanvas();
          const image = canvas.toDataURL('image/png');

          let props = vp.getProperties();
          const rotation = vp.getViewPresentation().rotation;
          expect(rotation).toBe(90);
          expect(props.interpolationType).toBe(InterpolationType.NEAREST);
          expect(props.invert).toBe(true);

          compareImages(
            image,
            imageURI_11_11_4_1_1_1_0_nearest_invert_90deg,
            'imageURI_11_11_4_1_1_1_0_nearest_invert_90deg'
          ).then(done, done.fail);
        });
      };

      try {
        vp.setStack([imageId1], 0).then(() => {
          subscribeToImageRendered();
          vp.setProperties({
            interpolationType: InterpolationType.NEAREST,
            voiRange: { lower: -260, upper: 140 },
            invert: true,
          });
          vp.setViewPresentation({ rotation: 90 });

          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should be able to resetProperties API', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_11_11_4_1_1_1_0';

      const vp = this.renderingEngine.getViewport(viewportId);

      const firstImageRenderedCallback = () => {
        element.removeEventListener(
          Events.IMAGE_RENDERED,
          firstImageRenderedCallback
        );

        let props = vp.getProperties();
        const rotation = vp.getViewPresentation().rotation;
        expect(rotation).toBe(90);
        expect(props.interpolationType).toBe(InterpolationType.NEAREST);
        expect(props.invert).toBe(true);

        setTimeout(() => {
          console.log('reseting properties');
          vp.resetProperties();
        });

        element.addEventListener(
          Events.IMAGE_RENDERED,
          secondImageRenderedCallback
        );
      };

      const secondImageRenderedCallback = () => {
        console.log('resetProperties callback');
        const props = vp.getProperties();
        expect(props.interpolationType).toBe(InterpolationType.LINEAR);
        expect(props.invert).toBe(false);

        done();
        console.log('done');
      };

      element.addEventListener(
        Events.IMAGE_RENDERED,
        firstImageRenderedCallback
      );

      try {
        vp.setStack([imageId1], 0).then(() => {
          vp.setProperties({
            interpolationType: InterpolationType.NEAREST,
            voiRange: { lower: -260, upper: 140 },
            invert: true,
          });
          vp.setRotation(90);
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });
  });

  describe('Calibration ', () => {
    const scale = 1.5;

    beforeEach(function () {
      cache.purgeCache();
      this.DOMElements = [];

      this.renderingEngine = new RenderingEngine(renderingEngineId);
      imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
      metaData.addProvider(fakeMetaDataProvider, 10000);
      metaData.addProvider(
        calibratedPixelSpacingMetadataProvider.get.bind(
          calibratedPixelSpacingMetadataProvider
        ),
        11000
      );
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

    const skipIt = () => null;
    // TODO - renable this when affine transforms are supported as part of
    // the calibration event instead of simple calibration ratios
    skipIt('Should be able to calibrate an image', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_11_11_4_1_1_1_0_1';

      const vp = this.renderingEngine.getViewport(viewportId);

      const firstCallback = () => {
        element.removeEventListener(Events.IMAGE_RENDERED, firstCallback);
        element.addEventListener(Events.IMAGE_RENDERED, secondCallback);
        const imageId = this.renderingEngine
          .getViewport(viewportId)
          .getCurrentImageId();

        calibrateImageSpacing(imageId, this.renderingEngine, scale);
      };

      const secondCallback = () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          calibrated_1_5_imageURI_11_11_4_1_1_1_0_1,
          'calibrated_1_5_imageURI_11_11_4_1_1_1_0_1'
        ).then(done, done.fail);
      };

      element.addEventListener(Events.IMAGE_RENDERED, firstCallback);

      try {
        vp.setStack([imageId1], 0);
        vp.render();
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should be able to fire imageCalibrated event with expected data', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      // Note: this should be a unique image in our tests, since we
      // are basically modifying the metadata of the image to be calibrated
      const imageId1 = 'fakeImageLoader:imageURI_64_46_4_1_1_1_0_1';

      const vp = this.renderingEngine.getViewport(viewportId);

      const imageRenderedCallback = () => {
        element.removeEventListener(
          Events.IMAGE_RENDERED,
          imageRenderedCallback
        );

        const imageId = this.renderingEngine
          .getViewport(viewportId)
          .getCurrentImageId();

        calibrateImageSpacing(imageId, this.renderingEngine, scale);

        element.addEventListener(
          Events.IMAGE_RENDERED,
          secondImageRenderedCallback
        );
      };

      const secondImageRenderedCallback = () => {
        done();
      };

      element.addEventListener(Events.IMAGE_RENDERED, imageRenderedCallback);

      element.addEventListener(Events.IMAGE_SPACING_CALIBRATED, (evt) => {
        expect(evt.detail).toBeDefined();
        expect(evt.detail.scale).toBe(scale);
        expect(evt.detail.viewportId).toBe(viewportId);
      });

      try {
        vp.setStack([imageId1], 0);
        vp.render();
      } catch (e) {
        done.fail(e);
      }
    });
  });

  describe('Flipping', function () {
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

    it('Should be able to flip a stack viewport horizontally', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      // imageId : imageLoaderScheme: imageURI_rows_columns_barStart_barWidth_xSpacing_ySpacing_rgbFlag
      const imageId = 'fakeImageLoader:imageURI_64_64_5_5_1_1_0';

      const vp = this.renderingEngine.getViewport(viewportId);
      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          imageURI_64_64_20_5_1_1_0_nearestFlipH,
          'imageURI_64_64_20_5_1_1_0_nearestFlipH'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId], 0).then(() => {
          vp.setProperties({
            interpolationType: InterpolationType.NEAREST,
          });

          vp.setCamera({ flipHorizontal: true });

          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should be able to flip a stack viewport vertically and rotate it', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      // imageId : imageLoaderScheme: imageURI_rows_columns_barStart_barWidth_xSpacing_ySpacing_rgbFlag
      const imageId = 'fakeImageLoader:imageURI_64_64_5_5_1_1_0';

      const vp = this.renderingEngine.getViewport(viewportId);
      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          imageURI_64_64_20_5_1_1_0_nearestFlipHRotate90,
          'imageURI_64_64_20_5_1_1_0_nearestFlipHRotate90'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId], 0).then(() => {
          vp.setProperties({
            interpolationType: InterpolationType.NEAREST,
          });

          vp.setRotation(90);

          vp.render();

          vp.setCamera({ flipVertical: true });
        });
      } catch (e) {
        done.fail(e);
      }
    });
  });
});
