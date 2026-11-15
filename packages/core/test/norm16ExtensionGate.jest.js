import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture';
import { VtkDataTypes } from '@kitware/vtk.js/Common/Core/DataArray/Constants';
import vtkStreamingOpenGLRenderWindow from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLRenderWindow';
import {
  applyNorm16ExtensionGate,
  resetNorm16ExtensionGateWarning,
  withoutNorm16Extension,
} from '../src/RenderingEngine/vtkClasses/norm16ExtensionGate';
import { getRenderingCapabilities } from '../src/utilities/renderingCapabilities';
import { coreLog } from '../src/utilities/logger';

jest.mock('../src/utilities/renderingCapabilities', () => ({
  getRenderingCapabilities: jest.fn(),
}));

const ALL_FORMATS = {
  webgl: true,
  maxTextureSize: 16384,
  renderer: 'test',
  softwareRasterizer: false,
  norm16: true,
  norm16Linear: true,
  float: true,
  floatLinear: true,
  halfFloat: true,
  halfFloatLinear: true,
};

const NORM16_EXTENSION = { R16_EXT: 0x822a, R16_SNORM_EXT: 0x8f98 };

function createFakeGL() {
  return {
    SHORT: 0x1402,
    UNSIGNED_SHORT: 0x1403,
    FLOAT: 0x1406,
    HALF_FLOAT: 0x140b,
    R16F: 0x822d,
    R32F: 0x822e,
    marker: 'fake',
    readMarker() {
      return this.marker;
    },
    getExtension(name) {
      if (name === 'EXT_texture_norm16') {
        return NORM16_EXTENSION;
      }

      if (name === 'OES_texture_float_linear') {
        return {};
      }

      return null;
    },
    getSupportedExtensions() {
      return ['EXT_texture_norm16', 'OES_texture_float_linear'];
    },
  };
}

function setCapabilities(overrides) {
  getRenderingCapabilities.mockReturnValue({ ...ALL_FORMATS, ...overrides });
}

function createWindowContext() {
  const renderWindow = vtkStreamingOpenGLRenderWindow.newInstance();

  return renderWindow.get3DContext();
}

function getShortTextureDataType(context) {
  const texture = vtkOpenGLTexture.newInstance();

  texture.setOpenGLRenderWindow({
    getContext: () => context,
    getWebgl2: () => true,
  });
  texture.setOglNorm16Ext(context.getExtension('EXT_texture_norm16'));

  return texture.getOpenGLDataType(VtkDataTypes.SHORT, true);
}

describe('norm16ExtensionGate', () => {
  let getContextSpy;
  let fakeGL;
  const originalWebGL2 = global.WebGL2RenderingContext;

  beforeEach(() => {
    global.WebGL2RenderingContext = function WebGL2RenderingContext() {};
    fakeGL = createFakeGL();
    resetNorm16ExtensionGateWarning();
    getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation((type) => (type === 'webgl2' ? fakeGL : null));
  });

  afterEach(() => {
    global.WebGL2RenderingContext = originalWebGL2;
    getContextSpy.mockRestore();
    getRenderingCapabilities.mockReset();
  });

  it('hides only EXT_texture_norm16 and keeps the methods bound to the context', () => {
    const context = withoutNorm16Extension(fakeGL);

    expect(context.getExtension('EXT_texture_norm16')).toBeNull();
    expect(context.getExtension('OES_texture_float_linear')).toEqual({});
    expect(context.getSupportedExtensions()).toEqual([
      'OES_texture_float_linear',
    ]);
    expect(context.readMarker()).toBe('fake');
    expect(context.FLOAT).toBe(fakeGL.FLOAT);
  });

  it('returns the context unchanged when the probe passes', () => {
    setCapabilities({});

    expect(applyNorm16ExtensionGate(fakeGL)).toBe(fakeGL);
  });

  it('the render window context lists norm16 when the probe passes', () => {
    setCapabilities({});

    const context = createWindowContext();

    expect(context.getExtension('EXT_texture_norm16')).toBe(NORM16_EXTENSION);
    expect(getShortTextureDataType(context)).toBe(fakeGL.SHORT);
  });

  it('the render window context hides norm16 when the probe says norm16 is unusable', () => {
    setCapabilities({ norm16Linear: false });

    const context = createWindowContext();

    expect(context.getExtension('EXT_texture_norm16')).toBeNull();
    expect(context.getExtension('OES_texture_float_linear')).toEqual({});
    expect(getShortTextureDataType(context)).toBe(fakeGL.FLOAT);
  });

  it('logs one warning when float textures cannot be filtered either', () => {
    const warn = jest
      .spyOn(
        coreLog.getLogger('RenderingEngine', 'norm16ExtensionGate'),
        'warn'
      )
      .mockImplementation(() => {});

    setCapabilities({ norm16: false, floatLinear: false });

    applyNorm16ExtensionGate(createFakeGL());
    applyNorm16ExtensionGate(createFakeGL());

    const calls = warn.mock.calls.filter((args) =>
      args.join(' ').includes('norm16')
    );

    warn.mockRestore();

    expect(calls).toHaveLength(1);
  });
});
