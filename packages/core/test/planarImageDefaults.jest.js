import * as cornerstone3D from '../src/index';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';
import {
  describe,
  it,
  expect,
  afterEach,
  beforeEach,
  jest,
} from '@jest/globals';
import { PlanarSampledSliceCanvas } from '../src/RenderingEngine/GenericViewport/Planar/planarSampledSliceCanvas';
import {
  getDefaultImageInvert,
  getDefaultImageVOIRange,
} from '../src/RenderingEngine/helpers/planarImageRendering';
import genericViewportDisplaySetMetadataProvider from '../src/utilities/genericViewportDisplaySetMetadataProvider';
import { createPlanarViewportOnStandInEngine } from './utils/planarViewportOnStandInEngine';

const { setUseCPURendering, imageLoader, metaData, init, cache } =
  cornerstone3D;

/**
 * The invert that the legacy stack viewport drew for each image of a stack of
 * a MONOCHROME2, a MONOCHROME1 and a MONOCHROME2 image, measured on the GPU
 * and on the CPU. The GPU turned it on at the MONOCHROME1 image and kept it
 * on for the MONOCHROME2 image after it; the CPU kept the invert of the first
 * image. A next viewport keeps the first two of the GPU and draws the last
 * image with its own default, as the 6.0 guide says.
 */
const LEGACY_MIXED_STACK_INVERTS = {
  gpu: [false, true, true],
  cpu: [false, false, false],
};

function setSize(element, width, height) {
  Object.defineProperty(element, 'offsetWidth', { value: width });
  Object.defineProperty(element, 'offsetHeight', { value: height });
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ width, height }),
  });
}

/**
 * Turns CPU rendering on, registers the fake image loader and gives a 64 by
 * 64 element for a viewport.
 */
function setUpCore() {
  setUseCPURendering(true);
  window.devicePixelRatio = 1;
  init({});
  imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
  metaData.addProvider(fakeMetaDataProvider, 10000);

  document.body.innerHTML = '<div id="element"></div>';

  const element = document.getElementById('element');
  setSize(element, 64, 64);

  return element;
}

/**
 * Image ids of the fake image loader for 16 by 16 images with the given
 * photometric interpretations, one per millimetre along z. A MONOCHROME1
 * image is marked `invert` by the loader, as the DICOM image loader marks it.
 */
function createPhotometricImageIds(photometricInterpretations) {
  return photometricInterpretations.map(
    (photometricInterpretation, sliceIndex) =>
      `fakeImageLoader:${encodeURIComponent(
        JSON.stringify({
          loader: 'fakeImageLoader',
          name: 'imageURI',
          rows: 16,
          columns: 16,
          barStart: 2,
          barWidth: 4,
          xSpacing: 1,
          ySpacing: 1,
          sliceIndex,
          photometricInterpretation,
        })
      )}`
  );
}

/**
 * The invert flag that the CPU image path of a planar viewport draws its
 * slice with. The CPU path draws in the next animation frame.
 */
async function readDrawnInvert(viewport, drawSpy) {
  drawSpy.mockClear();
  viewport.render();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const calls = drawSpy.mock.calls;

  return calls[calls.length - 1][0].presentation.invert;
}

describe('Direct next planar viewport and the default invert of an image', () => {
  let renderingEngines = [];
  let drawSpy;

  beforeEach(() => {
    drawSpy = jest.spyOn(PlanarSampledSliceCanvas.prototype, 'draw');
  });

  afterEach(() => {
    drawSpy.mockRestore();
    renderingEngines.forEach((renderingEngine) => renderingEngine.destroy());
    renderingEngines = [];
    cache.purgeCache();
    metaData.removeAllProviders();
    imageLoader.unregisterAllImageLoaders();
    genericViewportDisplaySetMetadataProvider.clear();
    setUseCPURendering(false);
  });

  it('draws each image of a mixed stack with its own default, where the legacy stack viewport kept an earlier invert', async () => {
    const { renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
      setUpCore(),
      'mixed'
    );
    const steps = [];

    renderingEngines.push(renderingEngine);
    genericViewportDisplaySetMetadataProvider.add('mixed', {
      kind: 'planar',
      imageIds: createPhotometricImageIds([
        'MONOCHROME2',
        'MONOCHROME1',
        'MONOCHROME2',
      ]),
      initialImageIdIndex: 0,
    });
    await viewport.setDisplaySets({ displaySetId: 'mixed' });
    steps.push(await readDrawnInvert(viewport, drawSpy));

    for (const imageIdIndex of [1, 2]) {
      await viewport.setImageIdIndex(imageIdIndex);
      steps.push(await readDrawnInvert(viewport, drawSpy));
    }

    expect(steps.slice(0, 2)).toEqual(
      LEGACY_MIXED_STACK_INVERTS.gpu.slice(0, 2)
    );
    expect(steps[0]).toBe(LEGACY_MIXED_STACK_INVERTS.cpu[0]);
    expect(steps[2]).toBe(false);
    expect(viewport.getDisplaySetPresentation('mixed').invert).toBeUndefined();
  });

  it('starts a display set of a direct planar viewport inverted and keeps what the application sets', async () => {
    const { renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
      setUpCore(),
      'direct'
    );

    renderingEngines.push(renderingEngine);
    genericViewportDisplaySetMetadataProvider.add('xray', {
      kind: 'planar',
      imageIds: createPhotometricImageIds(['MONOCHROME1']),
      initialImageIdIndex: 0,
    });

    await viewport.setDisplaySets({ displaySetId: 'xray' });

    expect(viewport.getDisplaySetPresentation('xray').invert).toBeUndefined();
    expect(viewport.getDefaultInvert('xray')).toBe(true);
    expect(await readDrawnInvert(viewport, drawSpy)).toBe(true);

    viewport.setDisplaySetPresentation('xray', { invert: false });

    expect(await readDrawnInvert(viewport, drawSpy)).toBe(false);

    viewport.resetDisplaySetPresentation('xray');

    expect(viewport.getDisplaySetPresentation('xray').invert).toBeUndefined();
    expect(await readDrawnInvert(viewport, drawSpy)).toBe(true);
  });
});

describe('getDefaultImageInvert', () => {
  afterEach(() => {
    metaData.removeAllProviders();
  });

  it('reads the photometric interpretation of the metadata before image.invert', () => {
    metaData.addProvider((type, imageId) => {
      if (type !== 'imagePixelModule') {
        return;
      }

      return { photometricInterpretation: imageId.split(':')[1] };
    });

    expect(getDefaultImageInvert({ imageId: 'pi:MONOCHROME1' })).toBe(true);
    expect(
      getDefaultImageInvert({ imageId: 'pi:MONOCHROME1', invert: false })
    ).toBe(true);
    expect(
      getDefaultImageInvert({ imageId: 'pi:MONOCHROME2', invert: true })
    ).toBe(false);
    expect(getDefaultImageInvert({ imageId: 'pi:', invert: true })).toBe(true);
    expect(getDefaultImageInvert({ imageId: 'pi:' })).toBe(false);
  });
});

describe('getDefaultImageVOIRange', () => {
  it('gives a grayscale image without a window the range of its pixel values, as the legacy stack viewport', () => {
    expect(
      getDefaultImageVOIRange({ minPixelValue: 100, maxPixelValue: 300 })
    ).toEqual({ lower: 100, upper: 300 });
    expect(
      getDefaultImageVOIRange({
        color: true,
        minPixelValue: 0,
        maxPixelValue: 255,
      })
    ).toBeUndefined();
  });
});
