import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

import * as volumeURI_100_100_10_1_1_1_0_scrolled from './groundTruth/volumeURI_100_100_10_1_1_1_0_scrolled.png';
import * as imageURI_64_64_0_20_1_1_0_scrolled from './groundTruth/imageURI_64_64_0_20_1_1_0_scrolled.png';
import * as imageURI_64_64_15_5_3_2_0 from './groundTruth/imageURI_64_64_15_5_3_2_0.png';
import * as imageURI_64_64_10_5_3_2_0 from './groundTruth/imageURI_64_64_10_5_3_2_0.png';

const {
  cache,
  RenderingEngine,
  Enums,
  imageLoader,
  metaData,
  volumeLoader,
  setVolumesForViewports,
} = cornerstone3D;

const { Events, ViewportType, InterpolationType } = Enums;

const { registerVolumeLoader } = volumeLoader;
const { StackScrollMouseWheelTool, ZoomTool, ToolGroupManager } = csTools3d;

const {
  fakeImageLoader,
  fakeMetaDataProvider,
  fakeVolumeLoader,
  createNormalizedMouseEvent,
  compareImages,
} = testUtils;

const renderingEngineId = 'RENDERING_ENGINE_UID22';
const toolGroupId = 'stackscrollmousetool';

const viewportId = 'VIEWPORT22';

const volumeId = `fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0`;

function createViewport(renderingEngine, viewportType, width, height) {
  const element = document.createElement('div');

  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  document.body.appendChild(element);

  renderingEngine.setViewports([
    {
      viewportId: viewportId,
      type: viewportType,
      element,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
  ]);
  return element;
}

describe('Cornerstone Tools Scroll Wheel: ', () => {
  beforeAll(() => {
    window.devicePixelRatio = 1;
    cornerstone3D.setUseCPURendering(false);
  });

  beforeEach(function () {
    csTools3d.init();
    csTools3d.addTool(StackScrollMouseWheelTool);
    csTools3d.addTool(ZoomTool);

    cache.purgeCache();
    this.DOMElements = [];

    this.stackToolGroup = ToolGroupManager.createToolGroup(toolGroupId);
    this.stackToolGroup.addTool(StackScrollMouseWheelTool.toolName, {
      debounceIfNotLoaded: false,
    });
    this.stackToolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

    this.renderingEngine = new RenderingEngine(renderingEngineId);
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
  });

  afterEach(function () {
    csTools3d.destroy();
    cache.purgeCache();
    this.renderingEngine.destroy();
    metaData.removeProvider(fakeMetaDataProvider);
    imageLoader.unregisterAllImageLoaders();
    ToolGroupManager.destroyToolGroup(toolGroupId);

    this.DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
  });

  it('Should successfully scroll through a volume', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.ORTHOGRAPHIC,
      512,
      128
    );
    this.DOMElements.push(element);

    const vp = this.renderingEngine.getViewport(viewportId);

    function renderEventHandler() {
      const index1 = [50, 50, 4];

      const { imageData } = vp.getImageData();

      const { pageX: pageX1, pageY: pageY1 } = createNormalizedMouseEvent(
        imageData,
        index1,
        element,
        vp
      );

      let evt = new WheelEvent('wheel', {
        target: element,
        pageX: pageX1,
        pageY: pageY1,
        deltaX: 0,
        deltaY: 12,
        deltaMode: 0,
        wheelDelta: -36,
        wheelDeltaX: 0,
        wheelDeltaY: -36,
      });

      attachEventHandler();

      element.dispatchEvent(evt);
    }

    function attachEventHandler() {
      const canvas = vp.getCanvas();

      element.removeEventListener(Events.IMAGE_RENDERED, renderEventHandler);
      element.addEventListener(
        Events.IMAGE_RENDERED,
        function secondImageRendered() {
          const image = canvas.toDataURL('image/png');
          compareImages(
            image,
            volumeURI_100_100_10_1_1_1_0_scrolled,
            'volumeURI_100_100_10_1_1_1_0_scrolled'
          ).then(done, done.fail);

          element.removeEventListener(
            Events.IMAGE_RENDERED,
            secondImageRendered
          );
        }
      );
    }

    element.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);

    this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

    try {
      volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          this.renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId]
        );
        vp.render();
      });
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully scroll through stack of images', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      256,
      256
    );
    this.DOMElements.push(element);

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
    const imageId2 = 'fakeImageLoader:imageURI_64_64_0_20_1_1_0';
    const vp = this.renderingEngine.getViewport(viewportId);

    function renderEventHandler() {
      // First render is the actual image render
      const index1 = [50, 50, 4];

      const { imageData } = vp.getImageData();

      const { pageX: pageX1, pageY: pageY1 } = createNormalizedMouseEvent(
        imageData,
        index1,
        element,
        vp
      );

      let evt = new WheelEvent('wheel', {
        target: element,
        pageX: pageX1,
        pageY: pageY1,
        deltaX: 0,
        deltaY: 12,
        deltaMode: 0,
        wheelDelta: -36,
        wheelDeltaX: 0,
        wheelDeltaY: -36,
      });

      attachEventHandler();

      element.removeEventListener(Events.IMAGE_RENDERED, renderEventHandler);
      element.dispatchEvent(evt);
    }

    function attachEventHandler() {
      const canvas = vp.getCanvas();

      element.addEventListener(
        Events.IMAGE_RENDERED,
        function secondImageRendered() {
          // Second render is as a result of scrolling
          const image = canvas.toDataURL('image/png');
          element.removeEventListener(
            Events.IMAGE_RENDERED,
            secondImageRendered
          );

          compareImages(
            image,
            imageURI_64_64_0_20_1_1_0_scrolled,
            'imageURI_64_64_0_20_1_1_0_scrolled'
          ).then(done, done.fail);
        }
      );
    }

    element.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);

    this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

    try {
      vp.setStack([imageId1, imageId2], 0).then(() => {
        vp.setProperties({ interpolationType: InterpolationType.NEAREST });
        vp.render();
      });
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully scroll through stack of images and then go back', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      256,
      256
    );
    this.DOMElements.push(element);

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_3_2_0';
    const imageId2 = 'fakeImageLoader:imageURI_64_64_15_5_3_2_0';
    const vp = this.renderingEngine.getViewport(viewportId);

    let handlerRun = false;
    let pageX1;
    let pageY1;
    function renderEventHandler() {
      if (handlerRun) return;
      handlerRun = true;

      // First render is the actual image render
      const index1 = [0, 0, 4];
      const index2 = [10, 10, 4];

      const { imageData } = vp.getImageData();

      const {
        pageX,
        pageY,
        clientX: clientX1,
        clientY: clientY1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp);

      pageX1 = pageX;
      pageY1 = pageY;

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
      } = createNormalizedMouseEvent(imageData, index2, element, vp);

      let evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 2,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      });
      element.dispatchEvent(evt);

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: element,
        buttons: 2,
        clientX: clientX2,
        clientY: clientY2,
        pageX: pageX2,
        pageY: pageY2,
      });
      document.dispatchEvent(evt);

      setTimeout(() => {
        evt = new WheelEvent('wheel', {
          target: element,
          pageX: pageX1,
          pageY: pageY1,
          deltaX: 0,
          deltaY: 12,
          deltaMode: 0,
          wheelDelta: -36,
          wheelDeltaX: 0,
          wheelDeltaY: -36,
        });

        attachEventHandler();

        element.removeEventListener(Events.IMAGE_RENDERED, renderEventHandler);
        element.dispatchEvent(evt);
      }, 500);
    }

    function attachEventHandler() {
      element.addEventListener(
        Events.IMAGE_RENDERED,
        function secondImageRendered() {
          // Second render is as a result of scrolling
          element.removeEventListener(
            Events.IMAGE_RENDERED,
            secondImageRendered
          );

          // Scroll back
          setTimeout(() => {
            const evt = new WheelEvent('wheel', {
              target: element,
              pageX: pageX1,
              pageY: pageY1,
              deltaX: 0,
              deltaY: -12,
              deltaMode: 0,
              wheelDelta: 36,
              wheelDeltaX: 0,
              wheelDeltaY: 36,
            });

            attachThirdImageRenderedHandler();

            element.dispatchEvent(evt);
          }, 500);
        }
      );
    }

    function attachThirdImageRenderedHandler() {
      const canvas = vp.getCanvas();

      element.addEventListener(
        Events.IMAGE_RENDERED,
        function thirdImageRendered() {
          // Third render is as a result of scrolling back
          const image = canvas.toDataURL('image/png');
          element.removeEventListener(
            Events.IMAGE_RENDERED,
            thirdImageRendered
          );

          compareImages(
            image,
            imageURI_64_64_10_5_3_2_0,
            'imageURI_64_64_10_5_3_2_0'
          ).then(done, done.fail);
        }
      );
    }

    element.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);

    this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

    try {
      vp.setStack([imageId1, imageId2], 0).then(() => {
        vp.setProperties({ interpolationType: InterpolationType.NEAREST });
        vp.render();
      });
    } catch (e) {
      done.fail(e);
    }
  });
});
