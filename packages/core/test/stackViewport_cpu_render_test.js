import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { encodeImageIdInfo } from '../../../utils/test/testUtils';

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
  utilities,
  imageLoader,
  metaData,
  Enums,
  setUseCPURendering,
  resetUseCPURendering,
  CONSTANTS,
} = cornerstone3D;

const { Events, ViewportType } = Enums;
const { CPU_COLORMAPS } = CONSTANTS;
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

// For some reason the cpu rendering is not working properly in the CI
describe('StackViewport CPU -- ', () => {
  beforeEach(() => {
    setUseCPURendering(true);
  });

  afterEach(() => {
    resetUseCPURendering();
  });

  describe('Basic Rendering --- ', function () {
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

    it('Should render one cpu stack viewport of square size properly', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 716, 646);
      this.DOMElements.push(element);

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

      const vp = this.renderingEngine.getViewport(viewportId);
      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
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
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageInfo = {
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 64,
        columns: 33,
        barStart: 20,
        barWidth: 5,
        xSpacing: 1,
        ySpacing: 1,
        sliceIndex: 0,
      };
      const imageId = encodeImageIdInfo(imageInfo);

      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
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
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageInfo = {
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 64,
        columns: 64,
        barStart: 30,
        barWidth: 10,
        xSpacing: 5,
        ySpacing: 5,
        sliceIndex: 0,
      };
      const imageId = encodeImageIdInfo(imageInfo);

      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          cpu_imageURI_64_64_30_10_5_5_0,
          'cpu_imageURI_64_64_30_10_5_5_0'
        ).then(done, done.fail);
      });

      try {
        vp.setStack([imageId], 0);
        // vp.setProperties({ interpolationType: InterpolationType.NEAREST });
        vp.render();
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should use enableElement API to render one cpu stack viewport of square size and 5mm spacing properly: nearest', function (done) {
      const element = document.createElement('div');
      this.DOMElements.push(element);

      element.style.width = `256px`;
      element.style.height = `256px`;
      document.body.appendChild(element);

      const imageInfo = {
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 64,
        columns: 64,
        barStart: 30,
        barWidth: 10,
        xSpacing: 5,
        ySpacing: 5,
        sliceIndex: 0,
      };
      const imageId = encodeImageIdInfo(imageInfo);

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
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageInfo1 = {
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 64,
        columns: 64,
        barStart: 0,
        barWidth: 10,
        xSpacing: 5,
        ySpacing: 5,
        sliceIndex: 0,
      };
      const imageId1 = encodeImageIdInfo(imageInfo1);

      const imageInfo2 = {
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 64,
        columns: 64,
        barStart: 10,
        barWidth: 20,
        xSpacing: 5,
        ySpacing: 5,
        sliceIndex: 1,
      };
      const imageId2 = encodeImageIdInfo(imageInfo2);

      const imageInfo3 = {
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 64,
        columns: 64,
        barStart: 20,
        barWidth: 30,
        xSpacing: 5,
        ySpacing: 5,
        sliceIndex: 2,
      };
      const imageId3 = encodeImageIdInfo(imageInfo3);

      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
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
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageInfo1 = {
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 64,
        columns: 64,
        barStart: 0,
        barWidth: 10,
        xSpacing: 5,
        ySpacing: 5,
        sliceIndex: 0,
      };
      const imageId1 = encodeImageIdInfo(imageInfo1);

      const imageInfo2 = {
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 64,
        columns: 64,
        barStart: 10,
        barWidth: 20,
        xSpacing: 5,
        ySpacing: 5,
        sliceIndex: 1,
      };
      const imageId2 = encodeImageIdInfo(imageInfo2);

      const imageInfo3 = {
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 64,
        columns: 64,
        barStart: 54,
        barWidth: 10,
        xSpacing: 5,
        ySpacing: 5,
        sliceIndex: 2,
      };
      const imageId3 = encodeImageIdInfo(imageInfo3);

      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
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

    it('Should render one cpu stack viewport with voi presets correctly: nearest', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageInfo = {
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 256,
        columns: 256,
        barStart: 100,
        barWidth: 100,
        xSpacing: 1,
        ySpacing: 1,
        sliceIndex: 0,
      };
      const imageId = encodeImageIdInfo(imageInfo);

      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
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
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageInfo1 = {
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 256,
        columns: 256,
        barStart: 100,
        barWidth: 100,
        xSpacing: 1,
        ySpacing: 1,
        sliceIndex: 0,
      };
      const imageId1 = encodeImageIdInfo(imageInfo1);

      const imageInfo2 = {
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 64,
        columns: 64,
        barStart: 30,
        barWidth: 10,
        xSpacing: 5,
        ySpacing: 5,
        sliceIndex: 0,
      };
      const imageId2 = encodeImageIdInfo(imageInfo2);

      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
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
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

      const imageInfo1 = {
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 11,
        columns: 11,
        barStart: 4,
        barWidth: 1,
        xSpacing: 1,
        ySpacing: 1,
        sliceIndex: 0,
      };
      const imageId1 = encodeImageIdInfo(imageInfo1);

      const imageInfo2 = {
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 256,
        columns: 256,
        barStart: 50,
        barWidth: 10,
        xSpacing: 1,
        ySpacing: 1,
        sliceIndex: 0,
      };
      const imageId2 = encodeImageIdInfo(imageInfo2);

      const vp = this.renderingEngine.getViewport(viewportId);
      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
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
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

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

      const vp = this.renderingEngine.getViewport(viewportId);
      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          cpu_imageURI_256_256_50_10_1_1_0_invert,
          'cpu_imageURI_256_256_50_10_1_1_0_invert'
        ).then(done, done.fail);
      });
      try {
        vp.setStack([imageId], 0).then(() => {
          vp.setProperties({ invert: true });
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should render one cpu stack viewport with rotation', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
      this.DOMElements.push(element);

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

      const vp = this.renderingEngine.getViewport(viewportId);
      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          cpu_imageURI_256_256_50_10_1_1_0_rotate,
          'cpu_imageURI_256_256_50_10_1_1_0_rotate'
        ).then(done, done.fail);
      });
      try {
        vp.setStack([imageId], 0).then(() => {
          vp.setViewPresentation({ rotation: 90 });
          vp.render();
        });
      } catch (e) {
        done.fail(e);
      }
    });
  });

  // describe('false colormap cpu', function () {
  //   beforeEach(function () {
  //     cache.purgeCache();
  //     this.DOMElements = [];

  //     this.renderingEngine = new RenderingEngine(renderingEngineId);
  //     imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
  //     metaData.addProvider(fakeMetaDataProvider, 10000);
  //   });

  //   afterEach(function () {
  //     cache.purgeCache();
  //     this.renderingEngine.destroy();
  //     metaData.removeProvider(fakeMetaDataProvider);
  //     imageLoader.unregisterAllImageLoaders();
  //     this.DOMElements.forEach((el) => {
  //       if (el.parentNode) {
  //         el.parentNode.removeChild(el);
  //       }
  //     });
  //   });

  //   it('Should render one cpu stack viewport with presets correctly', function (done) {
  //     const element = createViewport(this.renderingEngine, AXIAL, 256, 256);
  //     this.DOMElements.push(element);

  //     const imageId = 'fakeImageLoader:imageURI_256_256_100_100_1_1_0';

  //     const vp = this.renderingEngine.getViewport(viewportId);

  //     element.addEventListener(Events.IMAGE_RENDERED, () => {
  //       const canvas = vp.getCanvas();
  //       const image = canvas.toDataURL('image/png');

  //       compareImages(
  //         image,
  //         cpu_imageURI_256_256_100_100_1_1_0_hotIron,
  //         'cpu_imageURI_256_256_100_100_1_1_0_hotIron'
  //       ).then(done, done.fail);
  //     });

  //     try {
  //       vp.setStack([imageId], 0).then(() => {
  //         vp.setColormap(CPU_COLORMAPS.hotIron);
  //         vp.render();
  //       });
  //     } catch (e) {
  //       done.fail(e);
  //     }
  //   });
  // });
});
