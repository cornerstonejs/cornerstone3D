import { vtkStreamingOpenGLTexture } from '../src/RenderingEngine/vtkClasses';
import { VtkDataTypes } from '@kitware/vtk.js/Common/Core/DataArray/Constants';

describe('vtkStreamingOpenGLTexture', () => {
  it('allocates R16F when the streaming path selects filterable half-float', () => {
    const gl = {
      R16F: 0x822d,
      R32F: 0x822e,
      getExtension: jest.fn((name) =>
        name === 'OES_texture_float_linear' ? {} : null
      ),
    };
    const openGLRenderWindow = {
      getContext: () => gl,
      getWebgl2: () => true,
      getDefaultTextureInternalFormat: (
        _dataType,
        _numberOfComponents,
        _norm16Extension,
        useHalfFloat
      ) => (useHalfFloat ? gl.R16F : gl.R32F),
    };
    const texture = vtkStreamingOpenGLTexture.newInstance();

    texture.setOpenGLRenderWindow(openGLRenderWindow);
    texture.setUseHalfFloatForFloatData(true);
    expect(texture.useHalfFloat()).toBe(true);
    expect(texture.getInternalFormat(VtkDataTypes.FLOAT, 1)).toBe(gl.R16F);

    texture.resetFormatAndType();
    texture.setUseHalfFloatForFloatData(false);
    expect(texture.useHalfFloat()).toBe(false);
    expect(texture.getInternalFormat(VtkDataTypes.FLOAT, 1)).toBe(gl.R32F);
  });
});
