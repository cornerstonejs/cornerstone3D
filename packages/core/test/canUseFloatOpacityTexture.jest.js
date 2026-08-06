import canUseFloatOpacityTexture from '../src/RenderingEngine/vtkClasses/canUseFloatOpacityTexture';

function createContext(supportedExtensions) {
  return {
    getExtension: jest.fn((name) =>
      supportedExtensions.includes(name) ? {} : null
    ),
  };
}

function createRenderWindow(webgl2) {
  return {
    getWebgl2: jest.fn(() => webgl2),
  };
}

describe('canUseFloatOpacityTexture', () => {
  it('rejects a WebGL2 float texture without float-linear filtering', () => {
    const renderWindow = createRenderWindow(true);
    const context = createContext([]);

    expect(canUseFloatOpacityTexture(renderWindow, context)).toBe(false);
  });

  it('accepts a WebGL2 float texture with float-linear filtering', () => {
    const renderWindow = createRenderWindow(true);
    const context = createContext(['OES_texture_float_linear']);

    expect(canUseFloatOpacityTexture(renderWindow, context)).toBe(true);
  });

  it('accepts WebGL1 only when both float extensions are available', () => {
    const renderWindow = createRenderWindow(false);
    const context = createContext([
      'OES_texture_float',
      'OES_texture_float_linear',
    ]);

    expect(canUseFloatOpacityTexture(renderWindow, context)).toBe(true);
  });

  it('rejects WebGL1 when either float extension is unavailable', () => {
    const renderWindow = createRenderWindow(false);
    const context = createContext(['OES_texture_float_linear']);

    expect(canUseFloatOpacityTexture(renderWindow, context)).toBe(false);
  });
});
