import { coreLog } from '../../utilities/logger';
import { voxelGridWithinLimits } from '../../utilities/voxelGrid';
import {
  gpuSettingsForRender,
  gridLimitsOfGpuSettings,
  gpuTextureBytesPerVoxel,
} from '../../utilities/gpuSettingsPresets';
import { isWebGLBlocked } from '../../utilities/webglAvailability';
import { LARGE_ALLOCATION_BYTES } from '../../utilities/gpuAllocationTracker';

const log = coreLog.getLogger('RenderingEngine', 'gridFitsGpuSettings');
const warnedKeys = new Set();

/**
 * States whether the active GPU settings can hold a texture of these
 * dimensions.
 *
 * The count happens before the allocation. Under `auto`, the check uses the
 * memory limit of the whole page, not the share of the volume, so the mapper
 * never refuses a grid that the strategy chose. With final downsampling off,
 * every texture fits, so the mapper allocates as it did before the GPU
 * settings existed.
 *
 * A dynamic (4D) volume and a texture of more than one component also always
 * fit: the strategy does not reduce them (VRS-I-13, VRS-I-14), so the mapper
 * tries the upload as in 4.x instead of keeping the previous image.
 *
 * While WebGL waits (see `isWebGLBlocked`), a texture of 64 MB or more never
 * fits, whatever the GPU settings, so no large allocation follows a GPU
 * failure until the wait ends. The next render tries again.
 *
 * A refusal logs one warning for each volume, grid and GPU settings.
 *
 * @param {number[]} dims - the number of voxels on each axis
 * @param {string} dataType - the type of the buffer of the texture
 * @param {number} numberOfComponents - the number of components of one voxel
 * @param {{volumeId?: string, dynamic?: boolean, norm16?: boolean}} context -
 *   what the mapper knows about the volume, and whether its upload gets the
 *   norm16 extension (by default, the decision of the volume mappers)
 * @returns {boolean} true when the GPU settings can hold the texture
 */
export default function gridFitsGpuSettings(
  dims,
  dataType,
  numberOfComponents,
  context
) {
  const textureBytes =
    dims[0] *
    dims[1] *
    dims[2] *
    gpuTextureBytesPerVoxel(dataType, numberOfComponents, {
      norm16: context?.norm16,
    });

  if (textureBytes >= LARGE_ALLOCATION_BYTES && isWebGLBlocked()) {
    warnOnce(
      `blocked|${context?.volumeId}|${dims}`,
      `WebGL waits after a GPU failure, so the texture of ${dims[0]}x${dims[1]}x${dims[2]} for the volume ${context?.volumeId} waits too`
    );

    return false;
  }

  const active = gpuSettingsForRender();

  if (!active || numberOfComponents > 1 || context?.dynamic) {
    return true;
  }

  /** The bytes of the texture that vtk.js uploads, not of the CPU buffer. */
  const numBytes = gpuTextureBytesPerVoxel(dataType, numberOfComponents, {
    norm16: context?.norm16,
  });
  const gpuSettings = active;
  const limits = gridLimitsOfGpuSettings(gpuSettings, numBytes);
  const grid = {
    dimensions: [dims[0], dims[1], dims[2]],
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  };

  if (voxelGridWithinLimits(grid, limits)) {
    return true;
  }

  warnOnce(
    `${context?.volumeId}|${grid.dimensions}|${gpuSettings.id}|${limits.maxEdge}|${limits.maxVoxelCount}`,
    `the GPU settings preset ${gpuSettings.id} cannot hold a texture of ${dims[0]}x${dims[1]}x${dims[2]} for the volume ${context?.volumeId}, so no allocation is issued`
  );

  return false;
}

/** A refused texture rebuilds on each render, so warn once for each key. */
function warnOnce(key, message) {
  if (!warnedKeys.has(key)) {
    warnedKeys.add(key);
    log.warn(message);
  }
}
