import drawImageSync from '../src/RenderingEngine/helpers/cpuFallback/drawImageSync';
import calculateTransform from '../src/RenderingEngine/helpers/cpuFallback/rendering/calculateTransform';
import getDefaultViewport from '../src/RenderingEngine/helpers/cpuFallback/rendering/getDefaultViewport';
import initializeRenderCanvas from '../src/RenderingEngine/helpers/cpuFallback/rendering/initializeRenderCanvas';

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return canvas;
}

function createImage(imageId, width, height) {
  const pixelData = new Uint16Array(width * height).map(
    (_, index) => index % 256
  );

  return {
    imageId,
    width,
    height,
    rows: height,
    columns: width,
    color: false,
    rgba: false,
    slope: 1,
    intercept: 0,
    minPixelValue: 0,
    maxPixelValue: 255,
    windowCenter: 128,
    windowWidth: 256,
    invert: false,
    getPixelData: () => pixelData,
    voxelManager: { getScalarData: () => pixelData },
  };
}

/**
 * Counts the reads of every 2D canvas, as Chrome counts them for its
 * `willReadFrequently` warning.
 */
function spyOnReadbacks() {
  const context = document.createElement('canvas').getContext('2d');

  return jest.spyOn(Object.getPrototypeOf(context), 'getImageData');
}

describe('The render canvas of the CPU fallback', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('gives white opaque image data without reading the canvas back', () => {
    const readbacks = spyOnReadbacks();
    const image = createImage('image:1', 3, 2);
    const enabledElement = {
      renderingTools: { renderCanvas: createCanvas(1, 1) },
    };

    initializeRenderCanvas(enabledElement, image);

    const { renderCanvas, renderCanvasData } = enabledElement.renderingTools;

    expect(readbacks).not.toHaveBeenCalled();
    expect([renderCanvas.width, renderCanvas.height]).toEqual([3, 2]);
    expect([renderCanvasData.width, renderCanvasData.height]).toEqual([3, 2]);
    expect(Array.from(renderCanvasData.data).every((v) => v === 255)).toBe(
      true
    );
  });

  it('is never read while a stack of two image sizes is drawn', () => {
    const readbacks = spyOnReadbacks();
    const canvas = createCanvas(64, 64);
    const images = [
      createImage('image:localizer', 32, 16),
      createImage('image:axial', 16, 16),
      createImage('image:localizer-again', 32, 16),
    ];
    const enabledElement = {
      canvas,
      image: images[0],
      renderingTools: {},
      viewport: getDefaultViewport(canvas, images[0]),
    };

    for (const image of images) {
      enabledElement.image = image;
      enabledElement.transform = calculateTransform(enabledElement);
      drawImageSync(enabledElement, true);
    }

    const { renderCanvas } = enabledElement.renderingTools;

    expect(readbacks).not.toHaveBeenCalled();
    expect([renderCanvas.width, renderCanvas.height]).toEqual([32, 16]);
  });
});
