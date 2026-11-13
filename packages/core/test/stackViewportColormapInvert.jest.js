import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import StackViewport from '../src/RenderingEngine/StackViewport';

const COLORMAP = { name: 'Grayscale' };

/**
 * The part of a GPU stack viewport that setProperties uses for the colormap
 * and the invert, with a real vtkImageSlice whose transfer function maps
 * 0..255 from black to white.
 */
function createViewport({ invert }) {
  const actor = vtkImageSlice.newInstance();
  const cfun = vtkColorTransferFunction.newInstance();
  cfun.addRGBPoint(0, 0, 0, 0);
  cfun.addRGBPoint(255, 1, 1, 1);
  actor.getProperty().setRGBTransferFunction(0, cfun);

  const viewport = Object.create(StackViewport.prototype);
  Object.assign(viewport, {
    id: 'viewport',
    element: document.createElement('div'),
    csImage: {},
    globalDefaultProperties: {},
    invert: false,
    voiRange: { lower: 0, upper: 255 },
    getDefaultActor: () => ({ actor, uid: 'actor' }),
    render: jest.fn(),
  });
  // The CPU/GPU dispatchers are set up in the constructor.
  viewport.setColormap = StackViewport.prototype.setColormapGPU;
  viewport.setInvertColor = StackViewport.prototype.setInvertColorGPU;

  if (invert) {
    viewport.setProperties({ invert: true });
  }

  const grayAt = (x) => {
    const rgb = [];
    actor.getProperty().getRGBTransferFunction(0).getColor(x, rgb);
    return rgb[0];
  };

  return { viewport, grayAt };
}

describe('StackViewport colormap and invert', () => {
  it('applies a colormap upright on a viewport that is not inverted', () => {
    const { viewport, grayAt } = createViewport({ invert: false });

    viewport.setProperties({ colormap: COLORMAP });

    expect(viewport.invert).toBe(false);
    expect(grayAt(0)).toBeCloseTo(0);
    expect(grayAt(255)).toBeCloseTo(1);
  });

  // Invert, then apply a colormap: the colormap must show inverted, the same
  // as applying the colormap and then inverting. See #2397.
  it('keeps an inverted viewport inverted when a colormap is applied later', () => {
    const { viewport, grayAt } = createViewport({ invert: true });
    expect(grayAt(0)).toBeCloseTo(1);

    viewport.setProperties({ colormap: COLORMAP });

    expect(viewport.invert).toBe(true);
    expect(grayAt(0)).toBeCloseTo(1);
    expect(grayAt(255)).toBeCloseTo(0);
  });

  it('gives the same result for colormap then invert', () => {
    const { viewport, grayAt } = createViewport({ invert: false });

    viewport.setProperties({ colormap: COLORMAP });
    viewport.setProperties({ invert: true });

    expect(viewport.invert).toBe(true);
    expect(grayAt(0)).toBeCloseTo(1);
    expect(grayAt(255)).toBeCloseTo(0);
  });

  it('inverts a colormap set together with invert, on a viewport that is already inverted', () => {
    const { viewport, grayAt } = createViewport({ invert: true });

    viewport.setProperties({ colormap: COLORMAP, invert: true });

    expect(viewport.invert).toBe(true);
    expect(grayAt(0)).toBeCloseTo(1);
  });

  it('shows a colormap upright when the same call turns the invert off', () => {
    const { viewport, grayAt } = createViewport({ invert: true });

    viewport.setProperties({ colormap: COLORMAP, invert: false });

    expect(viewport.invert).toBe(false);
    expect(grayAt(0)).toBeCloseTo(0);
    expect(grayAt(255)).toBeCloseTo(1);
  });
});
