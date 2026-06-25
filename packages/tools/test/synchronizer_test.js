import * as cornerstone3D from '@cornerstonejs/core';
import * as testUtils from '../../../utils/test/testUtils';
import * as csTools3d from '../src/index';

const { utilities, Enums } = cornerstone3D;
const { ViewportType } = Enums;
const { SynchronizerManager } = csTools3d;
const renderingEngineId = utilities.uuidv4();

const viewportId1 = 'VIEWPORT1';
const viewportId2 = 'VIEWPORT2';

describe('Synchronizer:', () => {
  let testEnv;
  let renderingEngine;

  beforeEach(function () {
    testEnv = testUtils.setupTestEnvironment({
      renderingEngineId: renderingEngineId,
      viewportIds: [viewportId1, viewportId2],
    });

    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId: renderingEngineId,
    });
  });

  it('Should successfully remove event handlers on viewport removal', function () {
    const [element1, _] = testUtils.createViewports(renderingEngine, [
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
    let eventListenerCallCount = 0;
    const eventListener = () => {
      eventListenerCallCount += 1;
    };

    const synchronizer = SynchronizerManager.createSynchronizer(
      'axialSync',
      'testEvent',
      eventListener
    );

    const viewport1Info = {
      renderingEngineId: renderingEngine.id,
      viewportId: renderingEngine.getViewport(viewportId1).id,
    };
    const viewport2Info = {
      renderingEngineId: renderingEngine.id,
      viewportId: renderingEngine.getViewport(viewportId2).id,
    };
    synchronizer.addSource(viewport1Info);
    synchronizer.addTarget(viewport2Info);
    // we need a source so the event is fired, so remove and add the source back.
    // there should be one event listener active after this
    synchronizer.removeSource(viewport1Info);
    synchronizer.addSource(viewport1Info);

    element1.dispatchEvent(new CustomEvent('testEvent', {}));

    expect(eventListenerCallCount).toEqual(1);
  });
});
