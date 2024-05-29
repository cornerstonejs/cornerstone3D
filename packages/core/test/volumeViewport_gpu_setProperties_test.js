import * as cornerstone3D from '../src/index.js';
import * as testUtils from '../../../utils/test/testUtils.js';

// linear interpolation
import * as volumeURI_32_32_10_1_1_1_0 from './groundTruth/volumeURI_32_32_10_1_1_1_0.png.js';

const {
  cache,
  RenderingEngine,
  imageLoader,
  metaData,
  Enums,
  volumeLoader,
  utilities,
  setVolumesForViewports,
} = cornerstone3D;

const { ViewportType, Events } = Enums;

const { registerVolumeLoader } = volumeLoader;
const { unregisterAllImageLoaders } = imageLoader;

const { fakeMetaDataProvider, compareImages, fakeVolumeLoader } = testUtils;

const renderingEngineId = utilities.uuidv4();

const viewportId = 'VIEWPORT';

function createViewport(
  renderingEngine,
  orientation,
  width = 1000,
  height = 1000,
  type = ViewportType.ORTHOGRAPHIC
) {
  const element = document.createElement('div');

  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  document.body.appendChild(element);

  renderingEngine.setViewports([
    {
      viewportId: viewportId,
      type,
      element,
      defaultOptions: {
        orientation,
        background: [1, 0, 1], // pinkish background
      },
    },
  ]);
  return element;
}

describe('Volume Viewport SetProperties -- ', () => {
  beforeAll(() => {
    window.devicePixelRatio = 1;
    cornerstone3D.setUseCPURendering(false);
  });

  describe('should be able to use set Properties for volume viewport --- ', function () {
    beforeEach(function () {
      cache.purgeCache();

      this.DOMElements = [];
      this.renderingEngine = new RenderingEngine(renderingEngineId);

      metaData.addProvider(fakeMetaDataProvider, 10000);
      registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
    });

    afterEach(function () {
      cache.purgeCache();
      this.renderingEngine.destroy();

      metaData.removeProvider(fakeMetaDataProvider);
      unregisterAllImageLoaders();
      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });

    it('should successfully modify the viewport with invert and setVOI', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.CORONAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_32_32_10_1_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');
        compareImages(
          image,
          volumeURI_32_32_10_1_1_1_0,
          'volumeURI_32_32_10_1_1_1_0'
        ).then(done, done.fail);
      });

      try {
        // we don't set imageIds as we are mocking the imageVolume to
        // return the volume immediately
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              this.renderingEngine,
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
          .catch((e) => done(e));
      } catch (e) {
        done.fail(e);
      }
    });
  });
});
