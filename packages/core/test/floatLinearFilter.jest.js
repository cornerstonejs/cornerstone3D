import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture';
import { Filter } from '@kitware/vtk.js/Rendering/OpenGL/Texture/Constants';
import vtkStreamingOpenGLRenderWindow from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLRenderWindow';
import vtkStreamingOpenGLTexture from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLTexture';
import {
  applyFloatLinearExtensionGate,
  canFilterFloatTextures,
  isUnfilterableFloat,
  newFloatSafeTexture,
} from '../src/RenderingEngine/vtkClasses/floatLinearFilter';
import {
  getImageMapperTextureFacts,
  getTextureFormatName,
  useNearestForUnfilterableFloat,
} from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLImageMapper';
import { getRenderingCapabilities } from '../src/utilities/renderingCapabilities';

jest.mock('../src/utilities/renderingCapabilities', () => ({
  getRenderingCapabilities: jest.fn(),
}));

const PROFILE = {
  webgl: true,
  maxTextureSize: 16384,
  renderer: 'test',
  softwareRasterizer: false,
  webglCanvasCopy: true,
  norm16: true,
  norm16Linear: true,
  float: true,
  floatLinear: true,
  halfFloat: true,
  halfFloatLinear: true,
};

/** A WebGL2 context with the constants the textures read. */
function createFakeGL({ floatLinearExtension = true } = {}) {
  return {
    FLOAT: 0x1406,
    HALF_FLOAT: 0x140b,
    SHORT: 0x1402,
    NEAREST: 0x2600,
    LINEAR: 0x2601,
    R32F: 0x822e,
    RG32F: 0x8230,
    RGB32F: 0x8815,
    RGBA32F: 0x8814,
    R16F: 0x822d,
    R16_SNORM: 0x8f98,
    getExtension(name) {
      if (name === 'OES_texture_float_linear' && floatLinearExtension) {
        return {};
      }

      if (name === 'EXT_texture_norm16') {
        return { R16_SNORM_EXT: 0x8f98, R16_EXT: 0x822a };
      }

      return null;
    },
    getSupportedExtensions() {
      return [
        'EXT_texture_norm16',
        ...(floatLinearExtension ? ['OES_texture_float_linear'] : []),
      ];
    },
  };
}

function setProfile(overrides) {
  getRenderingCapabilities.mockReturnValue({ ...PROFILE, ...overrides });
}

/**
 * A texture of the given kind that holds the given internal format, without
 * a GL upload: the model fields that a build sets are written directly.
 */
function textureHolding(createTexture, gl, internalFormat) {
  const texture = createTexture();

  texture.setOpenGLRenderWindow({
    getContext: () => gl,
    getWebgl2: () => true,
  });
  texture.set({ internalFormat }, true, true);

  return texture;
}

describe('canFilterFloatTextures', () => {
  afterEach(() => getRenderingCapabilities.mockReset());

  it('follows the profile, not the extension, when the profile has WebGL2', () => {
    setProfile({ floatLinear: false });
    expect(canFilterFloatTextures(createFakeGL())).toBe(false);

    setProfile({ floatLinear: true });
    expect(
      canFilterFloatTextures(createFakeGL({ floatLinearExtension: false }))
    ).toBe(true);
  });

  it('follows the extension of the context without a profile of a WebGL2 context', () => {
    setProfile({ webgl: false, floatLinear: false });

    expect(canFilterFloatTextures(createFakeGL())).toBe(true);
    expect(
      canFilterFloatTextures(createFakeGL({ floatLinearExtension: false }))
    ).toBe(false);
  });
});

describe('isUnfilterableFloat', () => {
  const gl = createFakeGL();

  afterEach(() => getRenderingCapabilities.mockReset());

  it('is true for every 32-bit float format on a device that cannot filter them', () => {
    setProfile({ floatLinear: false });

    [gl.R32F, gl.RG32F, gl.RGB32F, gl.RGBA32F].forEach((format) => {
      expect(isUnfilterableFloat(gl, format)).toBe(true);
    });
  });

  it('is false for half float, norm16 and a device that filters float textures', () => {
    setProfile({ floatLinear: false });
    expect(isUnfilterableFloat(gl, gl.R16F)).toBe(false);
    expect(isUnfilterableFloat(gl, gl.R16_SNORM)).toBe(false);
    expect(isUnfilterableFloat(undefined, gl.R32F)).toBe(false);

    setProfile({ floatLinear: true });
    expect(isUnfilterableFloat(gl, gl.R32F)).toBe(false);
  });
});

describe('textures that sample unfilterable float with nearest filtering', () => {
  const gl = createFakeGL();

  afterEach(() => getRenderingCapabilities.mockReset());

  [
    ['newFloatSafeTexture', newFloatSafeTexture],
    ['vtkStreamingOpenGLTexture', vtkStreamingOpenGLTexture.newInstance],
  ].forEach(([name, createTexture]) => {
    it(`${name} sends nearest for R32F and keeps the linear filter of vtk.js`, () => {
      setProfile({ floatLinear: false });

      const texture = textureHolding(createTexture, gl, gl.R32F);

      texture.setMinificationFilter(Filter.LINEAR);
      texture.setMagnificationFilter(Filter.LINEAR);

      expect(texture.getOpenGLFilterMode(Filter.LINEAR)).toBe(gl.NEAREST);
      expect(texture.getMagnificationFilter()).toBe(Filter.LINEAR);
    });

    it(`${name} filters linearly again once it holds half float`, () => {
      setProfile({ floatLinear: false });

      const texture = textureHolding(createTexture, gl, gl.R32F);

      texture.set({ internalFormat: gl.R16F }, true, true);

      expect(texture.getOpenGLFilterMode(Filter.LINEAR)).toBe(gl.LINEAR);
    });

    it(`${name} is a stock texture on a device that filters float textures`, () => {
      setProfile({ floatLinear: true });

      const texture = textureHolding(createTexture, gl, gl.R32F);

      expect(texture.getOpenGLFilterMode(Filter.LINEAR)).toBe(gl.LINEAR);
      expect(texture.getOpenGLFilterMode(Filter.NEAREST)).toBe(gl.NEAREST);
    });
  });
});

describe('useNearestForUnfilterableFloat', () => {
  const gl = createFakeGL();

  afterEach(() => getRenderingCapabilities.mockReset());

  function builtTexture(internalFormat) {
    const texture = textureHolding(
      vtkOpenGLTexture.newInstance,
      gl,
      internalFormat
    );

    texture.set({ handle: {} }, true, true);
    texture.setMinificationFilter(Filter.LINEAR);
    texture.setMagnificationFilter(Filter.LINEAR);

    return texture;
  }

  it('sets nearest filters on an R32F opacity table that the device cannot filter', () => {
    setProfile({ floatLinear: false });

    const texture = builtTexture(gl.R32F);

    expect(useNearestForUnfilterableFloat(gl, texture)).toBe(true);
    expect(texture.getMagnificationFilter()).toBe(Filter.NEAREST);
    expect(texture.getMinificationFilter()).toBe(Filter.NEAREST);
    expect(useNearestForUnfilterableFloat(gl, texture)).toBe(false);
  });

  it('leaves half float, and any texture on a device that filters float textures', () => {
    setProfile({ floatLinear: false });

    const half = builtTexture(gl.R16F);

    expect(useNearestForUnfilterableFloat(gl, half)).toBe(false);
    expect(half.getMagnificationFilter()).toBe(Filter.LINEAR);

    setProfile({ floatLinear: true });

    const float = builtTexture(gl.R32F);

    expect(useNearestForUnfilterableFloat(gl, float)).toBe(false);
    expect(float.getMagnificationFilter()).toBe(Filter.LINEAR);
  });
});

describe('getTextureFormatName and getImageMapperTextureFacts', () => {
  it('names the single channel formats', () => {
    expect(getTextureFormatName(0x822e)).toBe('R32F');
    expect(getTextureFormatName(0x822d)).toBe('R16F');
    expect(getTextureFormatName(0x8f98)).toBe('R16_SNORM');
    expect(getTextureFormatName(0x822a)).toBe('R16');
    expect(getTextureFormatName(0x8229)).toBe('R8');
    expect(getTextureFormatName(0)).toBe('unknown');
  });

  it('has no facts for a mapper that was never drawn', () => {
    expect(getImageMapperTextureFacts({})).toBeUndefined();
    expect(getImageMapperTextureFacts(undefined)).toBeUndefined();
  });
});

describe('applyFloatLinearExtensionGate', () => {
  let getContextSpy;
  let fakeGL;
  const originalWebGL2 = global.WebGL2RenderingContext;

  beforeEach(() => {
    global.WebGL2RenderingContext = function WebGL2RenderingContext() {};
    fakeGL = createFakeGL();
    getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation((type) => (type === 'webgl2' ? fakeGL : null));
  });

  afterEach(() => {
    global.WebGL2RenderingContext = originalWebGL2;
    getContextSpy.mockRestore();
    getRenderingCapabilities.mockReset();
  });

  it('returns the context unchanged when the profile says float textures filter', () => {
    setProfile({ floatLinear: true });

    expect(applyFloatLinearExtensionGate(fakeGL)).toBe(fakeGL);
  });

  it('returns the context unchanged when it does not list the extension', () => {
    setProfile({ floatLinear: false });

    const context = createFakeGL({ floatLinearExtension: false });

    expect(applyFloatLinearExtensionGate(context)).toBe(context);
  });

  it('hides the extension when the profile says float textures do not filter', () => {
    setProfile({ floatLinear: false });

    const context = applyFloatLinearExtensionGate(fakeGL);

    expect(context).not.toBe(fakeGL);
    expect(context.getExtension('OES_texture_float_linear')).toBeNull();
    expect(context.getExtension('EXT_texture_norm16')).not.toBeNull();
    expect(context.getSupportedExtensions()).toEqual(['EXT_texture_norm16']);
    expect(context.FLOAT).toBe(fakeGL.FLOAT);
  });

  it('the render window context follows the profile', () => {
    setProfile({ floatLinear: false });

    const context = vtkStreamingOpenGLRenderWindow.newInstance().get3DContext();

    expect(context.getExtension('OES_texture_float_linear')).toBeNull();
    expect(context.getExtension('EXT_texture_norm16')).not.toBeNull();
  });

  it('the render window context lists the extension on a device that filters float textures', () => {
    setProfile({ floatLinear: true });

    const context = vtkStreamingOpenGLRenderWindow.newInstance().get3DContext();

    expect(context.getExtension('OES_texture_float_linear')).toEqual({});
  });
});
