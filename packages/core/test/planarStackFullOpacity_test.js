import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  waitFor,
} from './utils/planarSeriesBothModes';

const { utilities, cache, metaData, Enums } = cornerstone3D;
const { InterpolationType } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * The appearances of the stack that the pictures are compared in: none (the
 * default window and linear interpolation), nearest interpolation, and a
 * colormap without an opacity ramp, inverted.
 */
const APPEARANCES = [
  { name: 'the default appearance', appearance: undefined },
  {
    name: 'nearest interpolation',
    appearance: { interpolationType: InterpolationType.NEAREST },
  },
  {
    name: 'a colormap without an opacity ramp, inverted',
    appearance: { colormap: { name: 'hsv' }, invert: true },
  },
];

const pixelReader = document.createElement('canvas');

/** The RGBA bytes of what a canvas shows. */
function readPixels(canvas) {
  const context = pixelReader.getContext('2d', { willReadFrequently: true });

  pixelReader.width = canvas.width;
  pixelReader.height = canvas.height;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(canvas, 0, 0);

  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** The number of pixels of two pictures that differ in any channel. */
function countChangedPixels(actual, expected) {
  let changed = 0;

  for (let index = 0; index < actual.length; index += 4) {
    if (
      actual[index] !== expected[index] ||
      actual[index + 1] !== expected[index + 1] ||
      actual[index + 2] !== expected[index + 2] ||
      actual[index + 3] !== expected[index + 3]
    ) {
      changed++;
    }
  }

  return changed;
}

/** The number of different RGBA values of a picture. */
function countColours(pixels) {
  const colours = new Set();

  for (let index = 0; index < pixels.length; index += 4) {
    colours.add(
      (pixels[index] << 16) | (pixels[index + 1] << 8) | pixels[index + 2]
    );
  }

  return colours.size;
}

/**
 * Row 373 (lane FIX365-373): a layer of the stack path of the GPU backend
 * with no opacity ramp has an opacity function of 1, so that vtk.js keeps
 * its opacity texture over a scroll. Its pictures are those of the same
 * layer with no opacity function, which vtk.js draws with a table of 1:
 * each picture is drawn with the function and again with none, on the same
 * GPU, and the two are compared pixel by pixel.
 */
describe('The opacity function of 1 of a layer of the stack path on the GPU -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    cache.purgeCache();
    metaData.removeAllProviders();
  });

  /**
   * The picture of the viewport with the opacity function of its layer, and
   * with none; the function is given back after.
   */
  async function picturesWithAndWithoutFunction(viewport, property) {
    const opacityFunction = property.getScalarOpacity(0);
    const withFunction = readPixels(viewport.canvas);

    property.setScalarOpacity(0, null);
    await renderAndWait(viewport);

    const withoutFunction = readPixels(viewport.canvas);

    property.setScalarOpacity(0, opacityFunction);
    await renderAndWait(viewport);

    return { withFunction, withoutFunction };
  }

  APPEARANCES.forEach(({ name, appearance }) => {
    it(`draws a plain grey stack with ${name} as with no opacity function, also after a scroll`, async function () {
      const series = await createSeries({ id: 'fullOpacity' });
      const viewport = createNextViewport(renderingEngine, 'fullOpacity');
      const displaySetId = `stack:${viewport.id}`;

      await showStack(viewport, series, 2, appearance ? { appearance } : {});

      const binding = viewport.bindings.get(displaySetId);
      const property = binding.rendering.actor.getProperty();

      expect(binding.rendering.renderMode).toBe('vtkFrame');
      expect(
        Array.from(property.getScalarOpacity(0)?.getDataPointer() ?? [])
      ).toEqual([0, 1, 1, 1]);

      const first = await picturesWithAndWithoutFunction(viewport, property);

      expect(countColours(first.withFunction)).toBeGreaterThan(8);
      expect(
        countChangedPixels(first.withFunction, first.withoutFunction)
      ).toBe(0);

      viewport.setViewState({
        slice: { kind: 'stackIndex', imageIdIndex: 3 },
      });
      await waitFor(() => viewport.getCurrentImageId() === series.imageIds[3]);
      await renderAndWait(viewport);

      const next = await picturesWithAndWithoutFunction(viewport, property);

      expect(
        countChangedPixels(next.withFunction, first.withFunction)
      ).toBeGreaterThan(0);
      expect(countChangedPixels(next.withFunction, next.withoutFunction)).toBe(
        0
      );
    });
  });
});
