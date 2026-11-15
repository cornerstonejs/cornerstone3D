import { describe, it, expect } from '@jest/globals';
import vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture';
import {
  extend,
  getNorm16ShiftAndScale,
  newNorm16CorrectedTexture,
} from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLImageMapper';

const GL = {
  BYTE: 0x1400,
  UNSIGNED_BYTE: 0x1401,
  SHORT: 0x1402,
  UNSIGNED_SHORT: 0x1403,
  FLOAT: 0x1406,
  HALF_FLOAT: 0x140b,
};

/** A render window whose context holds only the type constants. */
function renderWindow() {
  return { getContext: () => GL };
}

/** The texel that WebGL2 reads from a norm16 texture for a stored value. */
function norm16Texel(value, signed) {
  return signed ? Math.max(value / 32767, -1) : value / 65535;
}

/** A texture of the given kind with its OpenGL data type set. */
function textureOf(createTexture, openGLDataType) {
  const texture = createTexture();

  texture.setOpenGLRenderWindow(renderWindow());
  texture.setOpenGLDataType(openGLDataType);

  return texture;
}

describe('getNorm16ShiftAndScale', () => {
  it('gives scale 32767 and shift 0 for SHORT', () => {
    expect(
      getNorm16ShiftAndScale(GL, GL.SHORT, { shift: -0.5, scale: 32767.5 })
    ).toEqual({ shift: 0, scale: 32767 });
  });

  it('gives scale 65535 and shift 0 for UNSIGNED_SHORT', () => {
    expect(
      getNorm16ShiftAndScale(GL, GL.UNSIGNED_SHORT, { shift: 0, scale: 65536 })
    ).toEqual({ shift: 0, scale: 65535 });
  });

  it('keeps the pair of vtk.js for float, half float and 8-bit textures', () => {
    [GL.FLOAT, GL.HALF_FLOAT, GL.UNSIGNED_BYTE, GL.BYTE].forEach((type) => {
      const pair = { shift: 0.25, scale: 3 };

      expect(getNorm16ShiftAndScale(GL, type, pair)).toBe(pair);
    });
  });

  it('keeps the pair of vtk.js when the texture has no context or type yet', () => {
    const pair = { shift: 0, scale: 1 };

    expect(getNorm16ShiftAndScale(null, GL.SHORT, pair)).toBe(pair);
    expect(getNorm16ShiftAndScale(GL, 0, pair)).toBe(pair);
  });
});

describe('norm16 texel back to the data value', () => {
  const int16Values = [-32767, -1024, -1, 0, 1, 1000, 3071, 32767];
  const uint16Values = [0, 1, 1000, 4095, 32768, 65535];

  it('gives every Int16 value back exactly with the corrected pair', () => {
    const texture = textureOf(newNorm16CorrectedTexture, GL.SHORT);
    const { shift, scale } = texture.getShiftAndScale();

    int16Values.forEach((value) => {
      expect(norm16Texel(value, true) * scale + shift).toBeCloseTo(value, 6);
    });
  });

  it('gives -32768 back as -32767, the clamp of R16_SNORM', () => {
    const texture = textureOf(newNorm16CorrectedTexture, GL.SHORT);
    const { shift, scale } = texture.getShiftAndScale();

    expect(norm16Texel(-32768, true) * scale + shift).toBe(-32767);
  });

  it('gives every Uint16 value back exactly with the corrected pair', () => {
    const texture = textureOf(newNorm16CorrectedTexture, GL.UNSIGNED_SHORT);
    const { shift, scale } = texture.getShiftAndScale();

    uint16Values.forEach((value) => {
      expect(norm16Texel(value, false) * scale + shift).toBeCloseTo(value, 6);
    });
  });

  it('is off by up to one unit with the stock pair of vtk.js', () => {
    const signed = textureOf(vtkOpenGLTexture.newInstance, GL.SHORT);
    const unsigned = textureOf(vtkOpenGLTexture.newInstance, GL.UNSIGNED_SHORT);
    const signedPair = signed.getShiftAndScale();
    const unsignedPair = unsigned.getShiftAndScale();

    expect(signedPair).toEqual({ shift: -0.5, scale: 32767.5 });
    expect(
      norm16Texel(-1024, true) * signedPair.scale + signedPair.shift
    ).toBeCloseTo(-1024.515625, 4);
    expect(
      norm16Texel(65535, false) * unsignedPair.scale + unsignedPair.shift
    ).toBeCloseTo(65536, 6);
  });

  it('gives the same pair as vtk.js for a float or half float texture', () => {
    [GL.FLOAT, GL.HALF_FLOAT, GL.UNSIGNED_BYTE].forEach((type) => {
      expect(
        textureOf(newNorm16CorrectedTexture, type).getShiftAndScale()
      ).toEqual(
        textureOf(vtkOpenGLTexture.newInstance, type).getShiftAndScale()
      );
    });
  });
});

describe('vtkStreamingOpenGLImageMapper', () => {
  it('draws through a corrected texture', () => {
    const publicAPI = {};
    const model = {};

    extend(publicAPI, model);

    expect(publicAPI.isA('vtkOpenGLImageMapper')).toBe(true);
    expect(publicAPI.isA('vtkStreamingOpenGLImageMapper')).toBe(true);
    expect(model.openGLTexture.isA('vtkNorm16CorrectedOpenGLTexture')).toBe(
      true
    );
    expect(model.openGLTexture.isA('vtkOpenGLTexture')).toBe(true);
  });
});
