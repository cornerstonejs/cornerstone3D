/**
 * The bytes that an allocated vtk.js texture holds on the GPU, from the data
 * type of its upload.
 *
 * vtk.js states 2 bytes for each 16-bit value on WebGL2 also when it uploads
 * the values as float, which it does when the context has no norm16 extension
 * and half float does not apply. The ledger counts what the GPU holds, so it
 * reads the type of the upload. A texture whose type this does not know keeps
 * the size that vtk.js states.
 *
 * @param {object} texture - a vtk.js OpenGL texture after its allocation
 * @returns {number} the bytes of the texture
 */
export default function allocatedTextureBytes(texture) {
  const {
    context: gl,
    width,
    height,
    depth,
    components,
    openGLDataType,
    allocatedGPUMemoryInBytes,
  } = texture.get(
    'context',
    'width',
    'height',
    'depth',
    'components',
    'openGLDataType',
    'allocatedGPUMemoryInBytes'
  );
  const stated = allocatedGPUMemoryInBytes || 0;

  if (
    typeof gl?.FLOAT !== 'number' ||
    openGLDataType === undefined ||
    !(width > 0) ||
    !(height > 0) ||
    !(components > 0)
  ) {
    return stated;
  }

  const bytesPerValue = {
    [gl.FLOAT]: 4,
    [gl.HALF_FLOAT]: 2,
    [gl.SHORT]: 2,
    [gl.UNSIGNED_SHORT]: 2,
    [gl.BYTE]: 1,
    [gl.UNSIGNED_BYTE]: 1,
  }[openGLDataType];

  if (!bytesPerValue) {
    return stated;
  }

  return width * height * Math.max(depth || 1, 1) * components * bytesPerValue;
}
