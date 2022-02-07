import * as cornerstone3D from '../src/index';

import * as cpu_imageURI_64_64_20_5_1_1_0 from './groundTruth/cpu_imageURI_64_64_20_5_1_1_0.png';
import * as cpu_imageURI_64_33_20_5_1_1_0 from './groundTruth/cpu_imageURI_64_33_20_5_1_1_0.png';
import * as cpu_imageURI_64_64_30_10_5_5_0 from './groundTruth/cpu_imageURI_64_64_30_10_5_5_0.png';
import * as cpu_imageURI_64_64_0_10_5_5_0 from './groundTruth/cpu_imageURI_64_64_0_10_5_5_0.png';
import * as cpu_imageURI_64_64_54_10_5_5_0 from './groundTruth/cpu_imageURI_64_64_54_10_5_5_0.png';
import * as cpu_imageURI_256_256_100_100_1_1_0_voi from './groundTruth/cpu_imageURI_256_256_100_100_1_1_0_voi.png';
import * as cpu_imageURI_256_256_100_100_1_1_0 from './groundTruth/cpu_imageURI_256_256_100_100_1_1_0.png';
import * as cpu_imageURI_256_256_50_10_1_1_0 from './groundTruth/cpu_imageURI_256_256_50_10_1_1_0.png';
import * as cpu_imageURI_256_256_50_10_1_1_0_invert from './groundTruth/cpu_imageURI_256_256_50_10_1_1_0_invert.png';
import * as cpu_imageURI_256_256_50_10_1_1_0_rotate from './groundTruth/cpu_imageURI_256_256_50_10_1_1_0_rotate.png';
import * as cpu_imageURI_256_256_100_100_1_1_0_hotIron from './groundTruth/cpu_imageURI_256_256_100_100_1_1_0_hotIron.png';

const {
  cache,
  RenderingEngine,
  VIEWPORT_TYPE,
  Utilities,
  registerImageLoader,
  unregisterAllImageLoaders,
  metaData,
  EVENTS,
  init,
  setUseCPURenderingOnlyForDebugOrTests,
  resetCPURenderingOnlyForDebugOrTests,
  cpuColormaps,
} = cornerstone3D;

const { fakeImageLoader, fakeMetaDataProvider, compareImages } =
  Utilities.testUtils;

const renderingEngineUID = Utilities.uuidv4();

const viewportUID = 'VIEWPORT';
const AXIAL = 'AXIAL';

const DOMElements = [];

function createCanvas(renderingEngine, orientation, width, height) {
  const canvas = document.createElement('canvas');

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  document.body.appendChild(canvas);
  DOMElements.push(canvas);

  renderingEngine.setViewports([
    {
      viewportUID: viewportUID,
      type: VIEWPORT_TYPE.STACK,
      canvas: canvas,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
      },
    },
  ]);
  return canvas;
}

describe('StackViewport CPU -- ', () => {
  beforeEach(() => {
    setUseCPURenderingOnlyForDebugOrTests(true);
  });

  afterEach(() => {
    resetCPURenderingOnlyForDebugOrTests();
  });

  describe('Basic Rendering --- ', function () {
    beforeEach(function () {
      cache.purgeCache();

      this.renderingEngine = new RenderingEngine(renderingEngineUID);
      registerImageLoader('fakeImageLoader', fakeImageLoader);
      metaData.addProvider(fakeMetaDataProvider, 10000);
    });

    afterEach(function () {
      cache.purgeCache();
      this.renderingEngine.destroy();
      metaData.removeProvider(fakeMetaDataProvider);
      unregisterAllImageLoaders();
      DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });

    it('Should render one cpu stack viewport of square size properly', function (done) {
      const canvas = createCanvas(this.renderingEngine, AXIAL, 716, 646);

      // imageId : imageLoaderScheme: imageURI_rows_colums_barStart_barWidth_xSpacing_ySpacing_rgbFlag
      const imageId = 'fakeImageLoader:imageURI_64_64_20_5_1_1_0';

      const vp = this.renderingEngine.getViewport(viewportUID);
      canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          cpu_imageURI_64_64_20_5_1_1_0,
          'cpu_imageURI_64_64_20_5_1_1_0'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId], 0);
        vp.render();
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should render one cpu stack viewport of rectangle size properly: nearest', function (done) {
      const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256);

      const imageId = 'fakeImageLoader:imageURI_64_33_20_5_1_1_0';

      const vp = this.renderingEngine.getViewport(viewportUID);

      canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          cpu_imageURI_64_33_20_5_1_1_0,
          'cpu_imageURI_64_33_20_5_1_1_0'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId], 0);
        vp.render();
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should render one cpu stack viewport of square size and 5mm spacing properly: nearest', function (done) {
      const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256);

      const imageId = 'fakeImageLoader:imageURI_64_64_30_10_5_5_0';

      const vp = this.renderingEngine.getViewport(viewportUID);

      canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          cpu_imageURI_64_64_30_10_5_5_0,
          'cpu_imageURI_64_64_30_10_5_5_0'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId], 0);
        // vp.setProperties({ interpolationType: INTERPOLATION_TYPE.NEAREST });
        vp.render();
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should use enableElement API to render one cpu stack viewport of square size and 5mm spacing properly: nearest', function (done) {
      const canvas = document.createElement('canvas');

      canvas.style.width = `256px`;
      canvas.style.height = `256px`;
      document.body.appendChild(canvas);
      DOMElements.push(canvas);

      // const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256)

      const imageId = 'fakeImageLoader:imageURI_64_64_30_10_5_5_0';

      this.renderingEngine.enableElement({
        viewportUID: viewportUID,
        type: VIEWPORT_TYPE.STACK,
        canvas: canvas,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
        },
      });

      const vp = this.renderingEngine.getViewport(viewportUID);

      canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          cpu_imageURI_64_64_30_10_5_5_0,
          'cpu_imageURI_64_64_30_10_5_5_0'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId], 0);
        vp.render();
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should render one cpu stack viewport, first slice correctly: nearest', function (done) {
      const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256);

      const imageId1 = 'fakeImageLoader:imageURI_64_64_0_10_5_5_0';
      const imageId2 = 'fakeImageLoader:imageURI_64_64_10_20_5_5_0';
      const imageId3 = 'fakeImageLoader:imageURI_64_64_20_30_5_5_0';

      const vp = this.renderingEngine.getViewport(viewportUID);

      canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          cpu_imageURI_64_64_0_10_5_5_0,
          'cpu_imageURI_64_64_0_10_5_5_0'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId1, imageId2, imageId3], 0);
        vp.render();
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should render one cpu stack viewport, last slice correctly: nearest', function (done) {
      const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256);

      const imageId1 = 'fakeImageLoader:imageURI_64_64_0_10_5_5_0';
      const imageId2 = 'fakeImageLoader:imageURI_64_64_10_20_5_5_0';
      const imageId3 = 'fakeImageLoader:imageURI_64_64_54_10_5_5_0';

      const vp = this.renderingEngine.getViewport(viewportUID);

      canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          cpu_imageURI_64_64_54_10_5_5_0,
          'cpu_imageURI_64_64_54_10_5_5_0'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId1, imageId2, imageId3], 2);
        vp.render();
      } catch (e) {
        done.fail(e);
      }
    });
  });

  describe('setProperties cpu', function () {
    beforeEach(function () {
      cache.purgeCache();

      this.renderingEngine = new RenderingEngine(renderingEngineUID);
      registerImageLoader('fakeImageLoader', fakeImageLoader);
      metaData.addProvider(fakeMetaDataProvider, 10000);
    });

    afterEach(function () {
      cache.purgeCache();
      this.renderingEngine.destroy();
      metaData.removeProvider(fakeMetaDataProvider);
      unregisterAllImageLoaders();
      DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });

    it('Should render one cpu stack viewport with voi presets correctly: nearest', function (done) {
      const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256);

      const imageId = 'fakeImageLoader:imageURI_256_256_100_100_1_1_0';

      const vp = this.renderingEngine.getViewport(viewportUID);

      canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          cpu_imageURI_256_256_100_100_1_1_0_voi,
          'cpu_imageURI_256_256_100_100_1_1_0_voi'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId], 0).then(() => {
          vp.setProperties({
            voiRange: { lower: 0, upper: 440 },
          });
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should render one cpu stack viewport with multiple imageIds of different size and different spacing: nearest', function (done) {
      const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256);

      const imageId1 = 'fakeImageLoader:imageURI_256_256_100_100_1_1_0';
      const imageId2 = 'fakeImageLoader:imageURI_64_64_30_10_5_5_0';

      const vp = this.renderingEngine.getViewport(viewportUID);

      canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          cpu_imageURI_256_256_100_100_1_1_0,
          'cpu_imageURI_256_256_100_100_1_1_0'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId1, imageId2], 0);
        vp.render();
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should render one cpu stack viewport with multiple images with linear interpolation correctly', function (done) {
      const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256);

      const imageId1 = 'fakeImageLoader:imageURI_11_11_4_1_1_1_0';
      const imageId2 = 'fakeImageLoader:imageURI_256_256_50_10_1_1_0';

      const vp = this.renderingEngine.getViewport(viewportUID);
      canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          cpu_imageURI_256_256_50_10_1_1_0,
          'cpu_imageURI_256_256_50_10_1_1_0'
        ).then(done, done.fail);
      });
      try {
        vp.setStack([imageId1, imageId2], 1);
        vp.render();
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should render one cpu stack viewport with invert', function (done) {
      const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256);

      const imageId1 = 'fakeImageLoader:imageURI_64_64_20_5_1_1_0';

      const vp = this.renderingEngine.getViewport(viewportUID);
      canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          cpu_imageURI_256_256_50_10_1_1_0_invert,
          'cpu_imageURI_256_256_50_10_1_1_0_invert'
        ).then(done, done.fail);
      });
      try {
        vp.setStack([imageId1], 0).then(() => {
          vp.setProperties({ invert: true });
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should render one cpu stack viewport with rotation', function (done) {
      const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256);

      const imageId1 = 'fakeImageLoader:imageURI_64_64_20_5_1_1_0';

      const vp = this.renderingEngine.getViewport(viewportUID);
      canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          cpu_imageURI_256_256_50_10_1_1_0_rotate,
          'cpu_imageURI_256_256_50_10_1_1_0_rotate'
        ).then(done, done.fail);
      });
      try {
        vp.setStack([imageId1], 0).then(() => {
          vp.setProperties({ rotation: 90 });
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });
  });

  describe('false colormap cpu', function () {
    beforeEach(function () {
      cache.purgeCache();

      this.renderingEngine = new RenderingEngine(renderingEngineUID);
      registerImageLoader('fakeImageLoader', fakeImageLoader);
      metaData.addProvider(fakeMetaDataProvider, 10000);
    });

    afterEach(function () {
      cache.purgeCache();
      this.renderingEngine.destroy();
      metaData.removeProvider(fakeMetaDataProvider);
      unregisterAllImageLoaders();
      DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });

    it('Should render one cpu stack viewport with presets correctly', function (done) {
      const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256);

      const imageId = 'fakeImageLoader:imageURI_256_256_100_100_1_1_0';

      const vp = this.renderingEngine.getViewport(viewportUID);

      canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          cpu_imageURI_256_256_100_100_1_1_0_hotIron,
          'cpu_imageURI_256_256_100_100_1_1_0_hotIron'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId], 0).then(() => {
          vp.setColormap(cpuColormaps.hotIron);
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });
  });
});
