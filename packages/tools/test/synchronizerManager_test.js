import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

import * as windowLevel_canvas2 from './groundTruth/windowLevel_canvas2.png';

const {
  cache,
  RenderingEngine,
  utilities,
  metaData,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  imageLoader,
  getEnabledElement,
} = cornerstone3D;

const { Events, ViewportType } = Enums;

const { unregisterAllImageLoaders } = imageLoader;
const { createAndCacheEmptyVolume, registerVolumeLoader } = volumeLoader;

const {
  StackScrollMouseWheelTool,
  WindowLevelTool,
  ToolGroupManager,
  synchronizers,
  SynchronizerManager,
  Enums: csToolsEnums,
} = csTools3d;

const { MouseBindings } = csToolsEnums;

const { fakeMetaDataProvider, fakeVolumeLoader, compareImages } = testUtils;

const { createCameraPositionSynchronizer, createVOISynchronizer } =
  synchronizers;

const renderingEngineId = utilities.uuidv4();

const viewportId1 = 'VIEWPORT1';
const viewportId2 = 'VIEWPORT2';

const ctVolumeId = `fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0`;
const ptVolumeId = `fakeVolumeLoader:volumeURI_100_100_15_1_1_1_0`;

let synchronizerId;

function createViewports(width, height) {
  const element1 = document.createElement('div');

  element1.style.width = `${width}px`;
  element1.style.height = `${height}px`;
  document.body.appendChild(element1);

  const element2 = document.createElement('div');

  element2.style.width = `${width}px`;
  element2.style.height = `${height}px`;
  document.body.appendChild(element2);

  return [element1, element2];
}

describe('Synchronizer Manager: ', () => {
  beforeAll(() => {
    window.devicePixelRatio = 1;
    cornerstone3D.setUseCPURendering(false);
  });

  beforeEach(function () {
    csTools3d.init();
    csTools3d.addTool(StackScrollMouseWheelTool);
    cache.purgeCache();
    this.DOMElements = [];

    this.firstToolGroup = ToolGroupManager.createToolGroup('volume1');
    this.firstToolGroup.addTool(StackScrollMouseWheelTool.toolName, {
      debounceIfNotLoaded: false,
    });
    this.firstToolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
    this.renderingEngine = new RenderingEngine(renderingEngineId);
    registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
  });

  afterEach(function () {
    // Destroy synchronizer manager to test it first since csTools3D also destroy
    // synchronizers
    SynchronizerManager.destroySynchronizer(synchronizerId);
    csTools3d.destroy();
    cache.purgeCache();
    this.renderingEngine.destroy();
    metaData.removeProvider(fakeMetaDataProvider);
    unregisterAllImageLoaders();
    ToolGroupManager.destroyToolGroup('volume1');

    this.DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
  });

  it('Should successfully synchronizes viewports for Camera sync', function (done) {
    const [element1, element2] = createViewports(512, 128);
    this.DOMElements.push(element1);
    this.DOMElements.push(element2);

    this.renderingEngine.setViewports([
      {
        viewportId: viewportId1,
        type: ViewportType.ORTHOGRAPHIC,
        element: element1,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.AXIAL,
        },
      },
      {
        viewportId: viewportId2,
        type: ViewportType.ORTHOGRAPHIC,
        element: element2,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.AXIAL,
        },
      },
    ]);

    let canvasesRendered = 0;

    const eventHandler = () => {
      canvasesRendered += 1;

      if (canvasesRendered !== 2) {
        return;
      }

      const synchronizers = SynchronizerManager.getSynchronizersForViewport(
        viewportId1,
        renderingEngineId
      );

      expect(synchronizers.length).toBe(1);

      const synchronizerById =
        SynchronizerManager.getSynchronizer(synchronizerId);

      expect(synchronizerById).toBe(synchronizers[0]);

      const allSynchronizers = SynchronizerManager.getAllSynchronizers();

      expect(allSynchronizers.length).toBe(1);
      expect(allSynchronizers[0]).toBe(synchronizerById);

      const createAnotherSynchronizer = () => {
        createCameraPositionSynchronizer('axialSync');
      };

      expect(createAnotherSynchronizer).toThrow();
      done();
    };

    element1.addEventListener(Events.IMAGE_RENDERED, eventHandler);
    element2.addEventListener(Events.IMAGE_RENDERED, eventHandler);

    this.firstToolGroup.addViewport(viewportId1, this.renderingEngine.id);
    this.firstToolGroup.addViewport(viewportId2, this.renderingEngine.id);

    try {
      const axialSync = createCameraPositionSynchronizer('axialSync');
      synchronizerId = axialSync.id;

      axialSync.add({
        renderingEngineId: this.renderingEngine.id,
        viewportId: this.renderingEngine.getViewport(viewportId1).id,
      });
      axialSync.add({
        renderingEngineId: this.renderingEngine.id,
        viewportId: this.renderingEngine.getViewport(viewportId2).id,
      });

      createAndCacheEmptyVolume(ctVolumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          this.renderingEngine,
          [{ volumeId: ctVolumeId }],
          [viewportId1]
        );
      });
      createAndCacheEmptyVolume(ptVolumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          this.renderingEngine,
          [{ volumeId: ptVolumeId }],
          [viewportId2]
        );
      });

      this.renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });
});

describe('Synchronizer Manager: ', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false);
  });

  beforeEach(function () {
    csTools3d.init();
    csTools3d.addTool(WindowLevelTool);
    cache.purgeCache();
    this.DOMElements = [];

    this.firstToolGroup = ToolGroupManager.createToolGroup('volume1');
    this.firstToolGroup.addTool(WindowLevelTool.toolName, {
      configuration: { volumeId: ctVolumeId },
    });
    this.firstToolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    });
    this.renderingEngine = new RenderingEngine(renderingEngineId);
    registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
  });

  afterEach(function () {
    // Destroy synchronizer manager to test it first since csTools3D also destroy
    // synchronizers
    SynchronizerManager.destroy();
    csTools3d.destroy();
    cache.purgeCache();
    this.renderingEngine.destroy();
    metaData.removeProvider(fakeMetaDataProvider);
    unregisterAllImageLoaders();
    ToolGroupManager.destroyToolGroup('volume1');

    this.DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
  });

  it('Should successfully synchronizes viewports for VOI Synchronizer', function (done) {
    const [element1, element2] = createViewports(512, 128);
    this.DOMElements.push(element1);
    this.DOMElements.push(element2);

    this.renderingEngine.setViewports([
      {
        viewportId: viewportId1,
        type: ViewportType.ORTHOGRAPHIC,
        element: element1,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.AXIAL,
        },
      },
      {
        viewportId: viewportId2,
        type: ViewportType.ORTHOGRAPHIC,
        element: element2,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.CORONAL,
        },
      },
    ]);

    let canvasesRendered = 0;
    const [pageX1, pageY1] = [16, 125];
    const [pageX2, pageY2] = [16, -500];

    const addEventListenerForVOI = () => {
      element2.addEventListener(Events.IMAGE_RENDERED, () => {
        const vp2 = this.renderingEngine.getViewport(viewportId2);
        const canvas2 = vp2.getCanvas();
        const image2 = canvas2.toDataURL('image/png');

        compareImages(image2, windowLevel_canvas2, 'windowLevel_canvas2').then(
          done,
          done.fail
        );
      });
    };

    const eventHandler = () => {
      canvasesRendered += 1;

      if (canvasesRendered !== 2) {
        return;
      }

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: element1,
        buttons: 1,
        clientX: pageX1,
        clientY: pageY1,
        pageX: pageX1,
        pageY: pageY1,
      });

      element1.dispatchEvent(evt);

      // Mouse move to put the end somewhere else
      const evt1 = new MouseEvent('mousemove', {
        target: element1,
        buttons: 1,
        clientX: pageX2,
        clientY: pageY2,
        pageX: pageX2,
        pageY: pageY2,
      });

      addEventListenerForVOI();
      document.dispatchEvent(evt1);

      const evt3 = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
      });

      document.dispatchEvent(evt3);
    };

    element1.addEventListener(Events.IMAGE_RENDERED, eventHandler);
    element2.addEventListener(Events.IMAGE_RENDERED, eventHandler);

    this.firstToolGroup.addViewport(viewportId1, this.renderingEngine.id);
    this.firstToolGroup.addViewport(viewportId2, this.renderingEngine.id);

    try {
      const voiSync = createVOISynchronizer('ctWLSync');

      voiSync.addSource({
        renderingEngineId: this.renderingEngine.id,
        viewportId: this.renderingEngine.getViewport(viewportId1).id,
      });
      voiSync.addTarget({
        renderingEngineId: this.renderingEngine.id,
        viewportId: this.renderingEngine.getViewport(viewportId2).id,
      });

      createAndCacheEmptyVolume(ctVolumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          this.renderingEngine,
          [{ volumeId: ctVolumeId }],
          [viewportId1, viewportId2]
        );
        this.renderingEngine.render();
      });
    } catch (e) {
      done.fail(e);
    }
  });
});
