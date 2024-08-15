import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '@cornerstonejs/tools';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../../../utils/test/testUtils';
import { encodeImageIdInfo } from '../../../../../utils/test/testUtils';

const { cache, RenderingEngine, Enums, metaData, imageLoader } = cornerstone3D;

const viewportId = 'VIEWPORT';

function createViewport(renderingEngine, viewportId, width, height) {
  const element = document.createElement('div');

  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  document.body.appendChild(element);

  renderingEngine.setViewports([
    {
      viewportId: viewportId,
      type: Enums.ViewportType.STACK,
      element,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
      },
    },
  ]);
  return element;
}

describe('stackContextPrefetch:', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false);
  });

  beforeEach(function () {
    cache.purgeCache();
    this.DOMElements = [];
    this.renderingEngine = new RenderingEngine();
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
  });

  afterEach(function () {
    this.DOMElements.forEach((el) => {
      if (el.parentNode) {
        csTools3d.utilities.stackContextPrefetch.disable(el);
      }
    });
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

  it('can be disabled without error', function (done) {
    const element = createViewport(this.renderingEngine, viewportId, 128, 128);
    this.DOMElements.push(element);
    const vp = this.renderingEngine.getViewport(viewportId);

    const imageId1 = encodeImageIdInfo({
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
