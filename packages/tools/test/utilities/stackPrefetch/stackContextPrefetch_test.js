import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '@cornerstonejs/tools';
import * as testUtils from '../../../../../utils/test/testUtils';

const { cache, RenderingEngine, Enums, metaData, imageLoader } = cornerstone3D;

const { ViewportType } = Enums;

const renderingEngineId = 'renderingEngineId-stackContextPrefetch_test';
const viewportId = 'VIEWPORT';

describe('stackContextPrefetch:', () => {
  let testEnv;

  beforeEach(function () {
    testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      viewportIds: [viewportId],
    });
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      cleanupDOMElements: true,
    });
  });

  it('can be disabled without error', function (done) {
    const element = testUtils.createViewports(testEnv.renderingEngine, {
      viewportType: ViewportType.STACK,
      orientation: Enums.OrientationAxis.AXIAL,
      viewportId: viewportId,
      width: 128,
      height: 128,
    });

    const vp = testEnv.renderingEngine.getViewport(viewportId);

    const imageId1 = testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'imageURI',
      rows: 64,
      columns: 64,
      barStart: 0,
      barWidth: 10,
      xSpacing: 5,
      ySpacing: 5,
      sliceIndex: 0,
    });

    try {
      vp.setStack([imageId1]).then(() => {
        csTools3d.utilities.stackContextPrefetch.enable(element);
        csTools3d.utilities.stackContextPrefetch.disable(element);
        done();
      });
    } catch (e) {
      done.fail(e);
    }
  });
});
