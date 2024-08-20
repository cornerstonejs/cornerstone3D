import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

// linear interpolation
import * as volumeURI_32_32_10_1_1_1_0 from './groundTruth/volumeURI_32_32_10_1_1_1_0.png';

const { cache, RenderingEngine, Enums, volumeLoader, setVolumesForViewports } =
  cornerstone3D;

const { Events } = Enums;

const viewportId = 'VIEWPORT';

fdescribe('Volume Viewport SetProperties -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      toolGroupIds: ['default'],
      viewportIds: [viewportId],
    });
    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId: renderingEngine.id,
      toolGroupIds: ['default'],
    });
  });

  it('should successfully modify the viewport with invert and setVOI', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportId,
      orientation: Enums.OrientationAxis.CORONAL,
      viewportType: Enums.ViewportType.ORTHOGRAPHIC,
    });

    const volumeId = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      name: 'volumeURI',
      rows: 32,
      columns: 32,
      slices: 10,
      xSpacing: 1,
      ySpacing: 1,
      rgb: 1,
    });
    const vp = renderingEngine.getViewport(viewportId);

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const canvas = vp.getCanvas();
      const image = canvas.toDataURL('image/png');
      testUtils
        .compareImages(
          image,
          volumeURI_32_32_10_1_1_1_0,
          'volumeURI_32_32_10_1_1_1_0'
        )
        .then(done, done.fail);
    });

    try {
      volumeLoader
        .createAndCacheVolume(volumeId, { imageIds: [] })
        .then(() => {
          setVolumesForViewports(
            renderingEngine,
            [{ volumeId: volumeId }],
            [viewportId]
          ).then(() => {
            vp.setProperties({
              voiRange: {
                lower: 50,
                upper: 100,
              },
              invert: true,
            });
            vp.render();
          });
        })
        .catch((e) => {
          done(e);
        });
    } catch (e) {
      done.fail(e);
    }
  });
});
