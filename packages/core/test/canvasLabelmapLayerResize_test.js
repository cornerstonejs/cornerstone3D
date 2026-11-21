import {
  composeCanvasLabelmapLayer,
  drawCanvasLabelmapLayer,
  findLabelBounds,
} from '../src/RenderingEngine/CanvasActor/canvasLabelmapLayer';

const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];

/**
 * The layer of a labelmap that fills a canvas of the given size with one
 * colour, its pixels on the pixels of the canvas.
 */
function filledLayer(width, height, color) {
  const labels = new Uint8Array(width * height).fill(1);

  return drawCanvasLabelmapLayer(
    {
      labels,
      width,
      height,
      labelBounds: findLabelBounds(labels, width, height),
      getColor: (label) => (label ? color : [0, 0, 0, 0]),
      outline: { use: false, thickness: [1], opacity: 1 },
      outlineAtImageEdges: false,
    },
    new DOMMatrix(),
    width,
    height
  );
}

/** A canvas element of the given size with its 2D context. */
function createCanvas(width, height) {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return { canvas, context: canvas.getContext('2d') };
}

/** The RGBA bytes of one pixel of a context. */
function pixelOf(context, x, y) {
  return Array.from(context.getImageData(x, y, 1, 1).data);
}

describe('The labelmap layers of a canvas -- ', () => {
  for (const [name, resize] of [
    ['width', (canvas) => (canvas.width = 6)],
    ['height', (canvas) => (canvas.height = 6)],
  ]) {
    it(`composes the first layer after a change of the ${name} of the canvas alone, without the layer of the size before`, function () {
      const { canvas, context } = createCanvas(8, 4);

      composeCanvasLabelmapLayer(context, filledLayer(8, 4, RED), 1);

      expect(pixelOf(context, 1, 1)).toEqual(RED);

      resize(canvas);
      composeCanvasLabelmapLayer(
        context,
        filledLayer(canvas.width, canvas.height, GREEN),
        1
      );

      expect(pixelOf(context, 1, 1)).toEqual(GREEN);
    });
  }

  it('draws a layer where the browser has no OffscreenCanvas', function () {
    const offscreenCanvas = window.OffscreenCanvas;
    const { context } = createCanvas(8, 4);
    let layer;
    let error;

    window.OffscreenCanvas = undefined;

    try {
      layer = filledLayer(8, 4, GREEN);
    } catch (thrown) {
      error = thrown;
    } finally {
      window.OffscreenCanvas = offscreenCanvas;
    }

    expect(error).toBeUndefined();
    expect(layer.canvas.width).toBe(8);
    expect(layer.canvas.height).toBe(4);

    composeCanvasLabelmapLayer(context, layer, 1);

    expect(pixelOf(context, 1, 1)).toEqual(GREEN);
  });
});
