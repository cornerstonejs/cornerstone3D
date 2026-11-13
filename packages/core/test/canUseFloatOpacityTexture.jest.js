import canUseFloatOpacityTexture from '../src/RenderingEngine/vtkClasses/canUseFloatOpacityTexture';

function createContext(supportedExtensions) {
  return {
    getExtension: jest.fn((name) =>
      supportedExtensions.includes(name) ? {} : null
    ),
  };
}

describe('canUseFloatOpacityTexture', () => {
  it('rejects a WebGL2 float texture without float-linear filtering', () => {
    const context = createContext([]);

    expect(canUseFloatOpacityTexture(context)).toBe(false);
  });

  it('accepts a WebGL2 float texture with float-linear filtering', () => {
    const context = createContext(['OES_texture_float_linear']);

    expect(canUseFloatOpacityTexture(context)).toBe(true);
  });
});
