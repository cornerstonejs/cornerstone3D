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
} = cornerstone3D;

const { Events, ViewportType } = Enums;

const { registerVolumeLoader, createAndCacheVolume } = volumeLoader;

const {
  StackScrollTool,
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

const ctVolumeId = testUtils.encodeVolumeIdInfo({
  loader: 'fakeVolumeLoader',
  id: 'ctVolumeId',
  rows: 100,
  columns: 100,
  slices: 10,
  xSpacing: 1,
  ySpacing: 1,
  zSpacing: 1,
});

const ptVolumeId = testUtils.encodeVolumeIdInfo({
  loader: 'fakeVolumeLoader',
  id: 'ptVolumeId',
  rows: 100,
  columns: 100,
  slices: 15,
  xSpacing: 1,
  ySpacing: 1,
  zSpacing: 1,
});

describe('Synchronizer Manager:', () => {
  let testEnv;
  let renderingEngine;
  let firstToolGroup;
  let synchronizerId;

  beforeEach(function () {
    testEnv = testUtils.setupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: ['volume1'],
      tools: [StackScrollTool, WindowLevelTool],
      toolActivations: {
        [StackScrollTool.toolName]: {
          bindings: [{ mouseButton: MouseBindings.Wheel }],
        },
        [WindowLevelTool.toolName]: {
          bindings: [{ mouseButton: MouseBindings.Primary }],
        },
      },
      viewportIds: [viewportId1, viewportId2],
    });

    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: ['volume1'],
    });
  });

  it('Should successfully synchronize viewports for Camera sync', function (done) {
    const [element1, element2] = testUtils.createViewports(renderingEngine, [
      {
        viewportType: ViewportType.ORTHOGRAPHIC,
        orientation: Enums.OrientationAxis.AXIAL,
        viewportId: viewportId1,
      },
      {
        viewportType: ViewportType.ORTHOGRAPHIC,
        orientation: Enums.OrientationAxis.AXIAL,
        viewportId: viewportId2,
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

    try {
      const axialSync = createCameraPositionSynchronizer('axialSync');
      synchronizerId = axialSync.id;

      axialSync.add({
        renderingEngineId: renderingEngine.id,
        viewportId: renderingEngine.getViewport(viewportId1).id,
      });
      axialSync.add({
        renderingEngineId: renderingEngine.id,
        viewportId: renderingEngine.getViewport(viewportId2).id,
      });

      createAndCacheVolume(ctVolumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          renderingEngine,
          [{ volumeId: ctVolumeId }],
          [viewportId1]
        );
      });
      createAndCacheVolume(ptVolumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          renderingEngine,
          [{ volumeId: ptVolumeId }],
          [viewportId2]
        );
      });

      renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully synchronize viewports for VOI Synchronizer', function (done) {
    const [element1, element2] = testUtils.createViewports(renderingEngine, [
      {
        viewportType: ViewportType.ORTHOGRAPHIC,
        orientation: Enums.OrientationAxis.AXIAL,
        viewportId: viewportId1,
      },
      {
        viewportType: ViewportType.ORTHOGRAPHIC,
        orientation: Enums.OrientationAxis.AXIAL,
        viewportId: viewportId2,
      },
    ]);

    let canvasesRendered = 0;
    const [pageX1, pageY1] = [16, 125];
    const [pageX2, pageY2] = [16, 100];

    const addEventListenerForVOI = () => {
      element2.addEventListener(Events.IMAGE_RENDERED, () => {
        const vp2 = renderingEngine.getViewport(viewportId2);
        const canvas2 = vp2.getCanvas();
        const image2 = canvas2.toDataURL('image/png');

        setTimeout(() => {
          compareImages(
            image2,
            windowLevel_canvas2,
            'windowLevel_canvas2'
          ).then(done, done.fail);
        }, 1500);
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

    try {
      const voiSync = createVOISynchronizer('ctWLSync');

      voiSync.addSource({
        renderingEngineId: renderingEngine.id,
        viewportId: renderingEngine.getViewport(viewportId1).id,
      });
      voiSync.addTarget({
        renderingEngineId: renderingEngine.id,
        viewportId: renderingEngine.getViewport(viewportId2).id,
      });

      createAndCacheVolume(ctVolumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          renderingEngine,
          [{ volumeId: ctVolumeId }],
          [viewportId1, viewportId2]
        );
        renderingEngine.render();
      });
    } catch (e) {
      done.fail(e);
    }
  });
});
