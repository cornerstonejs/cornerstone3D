import macro from '@kitware/vtk.js/macros';
import vtkOpenGLImageMapper from '@kitware/vtk.js/Rendering/OpenGL/ImageMapper';
import vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture';
import { Filter } from '@kitware/vtk.js/Rendering/OpenGL/Texture/Constants';
import {
  isUnfilterableFloatTexture,
  sampleUnfilterableFloatNearest,
} from './floatLinearFilter';

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
 * (see {@link getNorm16ShiftAndScale}), and that samples a 32-bit float
 * format this device cannot filter with nearest filtering (see
 * `sampleUnfilterableFloatNearest`).
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
  sampleUnfilterableFloatNearest(publicAPI);
}

export const newNorm16CorrectedTexture = macro.newInstance(
  extendTexture,
  'vtkNorm16CorrectedOpenGLTexture'
);

/**
 * Gives a 32-bit float texture nearest filtering when this device cannot
 * filter such textures linearly: the capability profile says `floatLinear`
 * is false, as in Safari on iOS, which has no `OES_texture_float_linear`
 * (see `isUnfilterableFloatTexture`). WebGL reads a float texture with a
 * linear filter as black there, so a layer whose opacity table is such a
 * texture is fully clear. With nearest filtering the values are right and
 * the picture is not smoothed. A half float texture (R16F), which vtk.js
 * fills from float data whose values fit, is left alone: WebGL2 can filter
 * it. It sets the filters of the texture, so it suits a texture that vtk.js
 * makes again whenever its content changes, such as the opacity table.
 *
 * @param context - The WebGL context of the texture
 * @param texture - A vtk.js OpenGL texture, or nothing
 * @returns Whether the filters of the texture were changed
 */
export function useNearestForUnfilterableFloat(context, texture) {
  if (!context || !texture?.getHandle?.()) {
    return false;
  }

  if (!isUnfilterableFloatTexture(texture)) {
    return false;
  }

  if (
    texture.getMinificationFilter() === Filter.NEAREST &&
    texture.getMagnificationFilter() === Filter.NEAREST
  ) {
    return false;
  }

  texture.setMinificationFilter(Filter.NEAREST);
  texture.setMagnificationFilter(Filter.NEAREST);

  return true;
}

const pendingTextureRows = new WeakMap();

/**
 * Asks the OpenGL image mapper of an image mapper to upload only some rows of
 * its 2D texture at the next render: rows of the image whose values changed
 * in place in the same scalar array, whose size and type did not change. The
 * rows of several requests before a render add up. The image data and its
 * scalars must not be marked modified for such a change, or vtk.js uploads
 * the whole texture anyway.
 *
 * @param mapper - The vtkImageMapper (not its OpenGL node)
 * @param rows - The rows of the image that changed
 */
export function requestImageTextureRows(mapper, rows) {
  if (!mapper || !rows?.length) {
    return;
  }

  const pending = pendingTextureRows.get(mapper) ?? new Set();

  rows.forEach((row) => pending.add(row));
  pendingTextureRows.set(mapper, pending);
  mapper.modified();
}

/**
 * The rows of the 2D texture of an image mapper that wait for their upload
 * (see {@link requestImageTextureRows}), in order.
 *
 * @param mapper - The vtkImageMapper (not its OpenGL node)
 */
export function getPendingImageTextureRows(mapper) {
  return [...(pendingTextureRows.get(mapper) ?? [])].sort((a, b) => a - b);
}

/**
 * The values of some rows of an image in the form of the texture that holds
 * the image, as `vtkOpenGLTexture.updateArrayDataTypeForGL` gives them for the
 * whole image: as they are for a texture of their own type (a norm16 texture
 * of 16-bit integers, a float texture of float values), converted for a float
 * texture of integer values, or undefined for a texture that needs another
 * conversion (half float, 8-bit from wider values), which is uploaded whole.
 */
function getTextureRowValues(context, openGLDataType, values) {
  const isFloatArray = values instanceof Float32Array;

  if (openGLDataType === context.FLOAT) {
    return isFloatArray ? values : new Float32Array(values);
  }

  if (
    (openGLDataType === context.SHORT && values instanceof Int16Array) ||
    (openGLDataType === context.UNSIGNED_SHORT &&
      values instanceof Uint16Array) ||
    (openGLDataType === context.UNSIGNED_BYTE && values instanceof Uint8Array)
  ) {
    return values;
  }
}

/**
 * Uploads some rows of the image of a 2D texture with `texSubImage2D`, one
 * call for each run of adjacent rows, when the texture holds an image of this
 * width and these components and their values need no conversion that
 * vtk.js makes for the whole image only (see `getTextureRowValues`).
 *
 * @param context - The WebGL2 context
 * @param texture - The vtk.js OpenGL texture of the image
 * @param values - The scalar values of the whole image
 * @param width - The width of the image
 * @param numberOfComponents - The values of one pixel
 * @param rows - The rows to upload, in order
 * @returns The number of rows uploaded, or -1 when the rows cannot be
 *   uploaded on their own and the texture needs a whole upload
 */
export function uploadImageTextureRows(
  context,
  texture,
  values,
  width,
  numberOfComponents,
  rows
) {
  if (
    !context?.texSubImage2D ||
    !texture?.getHandle?.() ||
    texture.getWidth() !== width ||
    texture.getComponents() !== numberOfComponents ||
    texture.getHeight() * width * numberOfComponents !== values.length
  ) {
    return -1;
  }

  const openGLDataType = texture.getReferenceByName('openGLDataType');
  const format = texture.getReferenceByName('format');
  const rowLength = width * numberOfComponents;
  const runs = [];

  rows.forEach((row) => {
    const run = runs[runs.length - 1];

    if (run && run.last === row - 1) {
      run.last = row;
    } else {
      runs.push({ first: row, last: row });
    }
  });

  const runValues = runs.map(({ first, last }) =>
    getTextureRowValues(
      context,
      openGLDataType,
      values.subarray(first * rowLength, (last + 1) * rowLength)
    )
  );

  if (runValues.some((runValue) => !runValue)) {
    return -1;
  }

  texture.activate();
  context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, false);
  context.pixelStorei(context.UNPACK_ALIGNMENT, 1);
  runs.forEach(({ first, last }, index) => {
    context.texSubImage2D(
      context.TEXTURE_2D,
      0,
      0,
      first,
      width,
      last - first + 1,
      format,
      openGLDataType,
      runValues[index]
    );
  });
  texture.deactivate();

  return rows.length;
}

const TEXTURE_FORMAT_NAMES = {
  0x8f98: 'R16_SNORM',
  0x822a: 'R16',
  0x822e: 'R32F',
  0x822d: 'R16F',
  0x8229: 'R8',
};

const imageTextureFacts = new WeakMap();

/**
 * Names the internal format of a single channel texture: 'R16_SNORM', 'R16',
 * 'R32F', 'R16F', 'R8', or 'unknown'.
 *
 * @param internalFormat - The WebGL internal format
 */
export function getTextureFormatName(internalFormat) {
  return TEXTURE_FORMAT_NAMES[internalFormat] ?? 'unknown';
}

/**
 * What the GPU holds for the image of an image mapper after its last draw:
 * the internal format of the 2D texture (see {@link getTextureFormatName}),
 * the filter that WebGL samples it with ('linear' or 'nearest'), and
 * `nearestForFloat`, true when that filter is nearest only because this
 * device cannot filter float textures. Undefined before the first draw.
 *
 * @param mapper - The vtkImageMapper (not its OpenGL node)
 */
export function getImageMapperTextureFacts(mapper) {
  return mapper ? imageTextureFacts.get(mapper) : undefined;
}

/** Reads the facts of {@link getImageMapperTextureFacts} from a texture. */
function readTextureFacts(context, texture) {
  if (!context || !texture?.getHandle?.()) {
    return undefined;
  }

  const filter = texture.getOpenGLFilterMode(texture.getMagnificationFilter());

  return {
    textureFormat: getTextureFormatName(
      texture.getReferenceByName('internalFormat')
    ),
    filter: filter === context.NEAREST ? 'nearest' : 'linear',
    nearestForFloat: isUnfilterableFloatTexture(texture),
  };
}

/**
 * The line of the label outline shader of vtk.js 36.4.1
 * (`Rendering/OpenGL/ImageMapper.js`) that reads a neighbour of a pixel.
 */
const LABEL_OUTLINE_NEIGHBOR_READ =
  'float value = texture2D(texture1, getSliceCoords(neighborPosIS, sliceAxis)).r;';

/**
 * The same read for an image whose edges are faces of a volume: a neighbour
 * outside the image makes the pixel a border pixel, as the label outline of
 * the vtk.js image reslice mapper does with a neighbour outside its 3D
 * texture.
 */
const LABEL_OUTLINE_NEIGHBOR_READ_AT_IMAGE_EDGES = [
  'vec2 neighborSliceCoords = getSliceCoords(neighborPosIS, sliceAxis);',
  'if (any(greaterThan(neighborSliceCoords, vec2(1.0))) || any(lessThan(neighborSliceCoords, vec2(0.0)))) {',
  '  pixelOnBorder = true;',
  '  break;',
  '}',
  'float value = texture2D(texture1, neighborSliceCoords).r;',
].join('\n');

/**
 * Whether an image mapper draws the label outline at the edges of its image
 * (the field `labelOutlineAtImageEdges` of the vtkImageMapper, set with
 * `mapper.set({ labelOutlineAtImageEdges: true }, true)`). Without it, vtk.js
 * reads a neighbour outside the image from the nearest edge pixel, so a label
 * that reaches the edge has no outline there.
 *
 * @param mapper - The vtkImageMapper (not its OpenGL node)
 */
export function drawsLabelOutlineAtImageEdges(mapper) {
  return mapper?.getReferenceByName?.('labelOutlineAtImageEdges') === true;
}

/**
 * vtkStreamingOpenGLImageMapper - the vtk.js OpenGL image mapper with the
 * right shift and scale for 16-bit norm16 textures, and with float textures
 * that still draw on a device that cannot filter them linearly.
 *
 * vtk.js 36.4.1 (`Rendering/OpenGL/Texture.js`, `getShiftAndScale`) gives
 * scale 32767.5, shift -0.5 for SHORT and scale 65536, shift 0 for
 * UNSIGNED_SHORT. The image mapper uses that pair to turn the texel of a
 * norm16 texture back into the data value, so with `EXT_texture_norm16` an
 * Int16 value draws between 0 and 1 unit too low (`c / 65534 - 0.5`) and a
 * Uint16 value between 0 and 1 unit too high (`c / 65535`). This class only
 * gives its 2D texture the right pair; it changes nothing for a texture that
 * is not norm16 (float, half float, 8-bit). That part can go when vtk.js
 * fixes `getShiftAndScale`.
 *
 * vtk.js also gives the image texture and the opacity table a linear filter
 * whenever the image is interpolated, also when they are 32-bit float
 * textures on a device that cannot filter those. This class samples such a
 * texture with nearest filtering: its image texture always does that (see
 * `sampleUnfilterableFloatNearest`), and the opacity table, which vtk.js
 * makes again for each new opacity function, gets nearest filters after each
 * build (see {@link useNearestForUnfilterableFloat}). It also keeps
 * what it holds for the debug panel and the draw self-test (see
 * {@link getImageMapperTextureFacts}).
 *
 * A mapper whose image is a labelmap slice of a volume can draw the label
 * outline at the edges of its image, as the image reslice mapper draws it at
 * the faces of the volume (see {@link drawsLabelOutlineAtImageEdges}).
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */
function vtkStreamingOpenGLImageMapper(publicAPI, model) {
  model.classHierarchy.push('vtkStreamingOpenGLImageMapper');

  const superBuildBufferObjects = publicAPI.buildBufferObjects;

  publicAPI.buildBufferObjects = (ren, actor) => {
    uploadPendingRows();
    superBuildBufferObjects(ren, actor);
    useNearestForUnfilterableFloat(model.context, model.pwfTexture);

    const facts = readTextureFacts(model.context, model.openGLTexture);

    if (model.renderable && facts) {
      imageTextureFacts.set(model.renderable, facts);
    }
  };

  /**
   * Uploads the rows that wait (`requestImageTextureRows`) into the texture
   * that holds the image now, or, when they cannot go on their own, marks the
   * scalars modified so that vtk.js uploads the whole image in this build.
   */
  function uploadPendingRows() {
    const rows = getPendingImageTextureRows(model.renderable);

    if (!rows.length) {
      return;
    }

    pendingTextureRows.delete(model.renderable);

    const scalars = model.currentInput?.getPointData?.()?.getScalars?.();

    if (!scalars) {
      return;
    }

    const uploaded = uploadImageTextureRows(
      model.context,
      model.openGLTexture,
      scalars.getData(),
      model.currentInput.getDimensions()[0],
      scalars.getNumberOfComponents(),
      rows
    );

    if (uploaded < 0) {
      scalars.modified();
    }
  }

  const superReplaceShaderValues = publicAPI.replaceShaderValues;

  publicAPI.replaceShaderValues = (shaders, ren, actor) => {
    superReplaceShaderValues(shaders, ren, actor);

    if (drawsLabelOutlineAtImageEdges(model.renderable)) {
      shaders.Fragment = shaders.Fragment.replace(
        LABEL_OUTLINE_NEIGHBOR_READ,
        LABEL_OUTLINE_NEIGHBOR_READ_AT_IMAGE_EDGES
      );
    }
  };
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
