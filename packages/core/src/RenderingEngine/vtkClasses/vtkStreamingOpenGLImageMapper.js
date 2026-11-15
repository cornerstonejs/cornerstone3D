import macro from '@kitware/vtk.js/macros';
import vtkOpenGLImageMapper from '@kitware/vtk.js/Rendering/OpenGL/ImageMapper';
import vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture';

/**
 * The shift and scale that turn a texel of a 2D texture back into the data
 * value: `value = texel * scale + shift`.
 *
 * For a norm16 texture of WebGL2 (`EXT_texture_norm16`) the texel of a stored
 * value c is `max(c / 32767, -1)` for SHORT (R16_SNORM) and `c / 65535` for
 * UNSIGNED_SHORT (R16), so the pair is scale 32767 or 65535 with shift 0. This
 * is the pair that `vtkOpenGLTexture.updateVolumeInfoForGL` gives the 3D
 * textures. Every other data type (float, half float, 8-bit) keeps the pair
 * that vtk.js gives.
 *
 * @param context - The WebGL context of the texture, for its type constants
 * @param openGLDataType - The data type of the texture
 * @param shiftAndScale - The pair that vtk.js gives for that texture
 */
export function getNorm16ShiftAndScale(context, openGLDataType, shiftAndScale) {
  if (!context || !openGLDataType) {
    return shiftAndScale;
  }

  if (openGLDataType === context.SHORT) {
    return { shift: 0, scale: 32767 };
  }

  if (openGLDataType === context.UNSIGNED_SHORT) {
    return { shift: 0, scale: 65535 };
  }

  return shiftAndScale;
}

/**
 * The 2D texture of {@link vtkStreamingOpenGLImageMapper}: a vtk.js OpenGL
 * texture whose `getShiftAndScale` gives the right pair for norm16 textures
 * (see {@link getNorm16ShiftAndScale}).
 */
function vtkNorm16CorrectedOpenGLTexture(publicAPI, model) {
  model.classHierarchy.push('vtkNorm16CorrectedOpenGLTexture');

  const superGetShiftAndScale = publicAPI.getShiftAndScale;

  publicAPI.getShiftAndScale = () =>
    getNorm16ShiftAndScale(
      model.context,
      model.openGLDataType,
      superGetShiftAndScale()
    );
}

function extendTexture(publicAPI, model, initialValues = {}) {
  vtkOpenGLTexture.extend(publicAPI, model, initialValues);

  vtkNorm16CorrectedOpenGLTexture(publicAPI, model);
}

export const newNorm16CorrectedTexture = macro.newInstance(
  extendTexture,
  'vtkNorm16CorrectedOpenGLTexture'
);

/**
 * vtkStreamingOpenGLImageMapper - the vtk.js OpenGL image mapper with the
 * right shift and scale for 16-bit norm16 textures.
 *
 * vtk.js 36.4.1 (`Rendering/OpenGL/Texture.js`, `getShiftAndScale`) gives
 * scale 32767.5, shift -0.5 for SHORT and scale 65536, shift 0 for
 * UNSIGNED_SHORT. The image mapper uses that pair to turn the texel of a
 * norm16 texture back into the data value, so with `EXT_texture_norm16` an
 * Int16 value draws between 0 and 1 unit too low (`c / 65534 - 0.5`) and a
 * Uint16 value between 0 and 1 unit too high (`c / 65535`). This class only
 * gives its 2D texture the right pair; it changes nothing for a texture that
 * is not norm16 (float, half float, 8-bit). It can go when vtk.js fixes
 * `getShiftAndScale`.
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */
function vtkStreamingOpenGLImageMapper(publicAPI, model) {
  model.classHierarchy.push('vtkStreamingOpenGLImageMapper');
}

const DEFAULT_VALUES = {};

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  vtkOpenGLImageMapper.extend(publicAPI, model, initialValues);

  model.openGLTexture = newNorm16CorrectedTexture({ resizable: true });

  vtkStreamingOpenGLImageMapper(publicAPI, model);
}

export const newInstance = macro.newInstance(
  extend,
  'vtkStreamingOpenGLImageMapper'
);

export default { newInstance, extend };
