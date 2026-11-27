import { coreLog } from '../../utilities/logger';
import { voxelGridWithinLimits } from '../../utilities/voxelGrid';
import {
  gpuSettingsForRender,
  gridLimitsOfGpuSettings,
  gpuTextureBytesPerVoxel,
} from '../../utilities/gpuSettingsPresets';

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
 * Only the edge limit refuses a texture, because an edge above it fails on
 * the device (GPULIM-U-4). A texture above the memory limit that reaches the
 * mapper is one the strategy could not reduce, so the mapper allocates it
 * anyway: the limit came from the application or the user, and a failure is
 * recorded (GPULIM-U-13). Each case logs one warning for each volume, grid
 * and GPU settings.
 *
 * @param {number[]} dims - the number of voxels on each axis
 * @param {string} dataType - the type of the buffer of the texture
 * @param {number} numberOfComponents - the number of components of one voxel
 * @param {{volumeId?: string, dynamic?: boolean, norm16?: boolean}} context -
 *   what the mapper knows about the volume, and whether its upload gets the
 *   norm16 extension (by default, the decision of the volume mappers)
 * @returns {boolean} true when the mapper may allocate the texture
 */
export default function gridFitsGpuSettings(
  dims,
  dataType,
  numberOfComponents,
  context
) {
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

  const fitsEdge = voxelGridWithinLimits(grid, { maxEdge: limits.maxEdge });

  /** A refused texture rebuilds on each render, so warn once for each key. */
  const key = `${context?.volumeId}|${grid.dimensions}|${gpuSettings.id}|${limits.maxEdge}|${limits.maxVoxelCount}`;

  if (!warnedKeys.has(key)) {
    warnedKeys.add(key);
    log.warn(
      fitsEdge
        ? `the GPU memory limit of ${gpuSettings.id} is below a texture of ${dims[0]}x${dims[1]}x${dims[2]} for the volume ${context?.volumeId}, which cannot be reduced, so it is allocated anyway`
        : `the GPU settings preset ${gpuSettings.id} cannot hold a texture of ${dims[0]}x${dims[1]}x${dims[2]} for the volume ${context?.volumeId}, so no allocation is issued`
    );
  }

  return fitsEdge;
}
