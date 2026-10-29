import { coreLog } from '../../utilities/logger';
import { getBufferConfiguration } from '../../utilities/getBufferConfiguration';
import { voxelGridWithinLimits } from '../../utilities/voxelGrid';
import {
  getActiveGpuCapabilityProfile,
  gridLimitsOfProfile,
  profileForGrid,
} from '../../utilities/gpuCapabilityProfiles';

const log = coreLog.getLogger('RenderingEngine', 'gridFitsProfile');

/**
 * States whether the device that the active capability profile describes can
 * hold a texture of these dimensions.
 *
 * The count happens before the allocation. Under `auto`, an edge above the
 * reliable edge runs the edge probe first (see `profileForGrid`).
 *
 * @param {number[]} dims - the number of voxels on each axis
 * @param {string} dataType - the type of the buffer of the texture
 * @param {number} numberOfComponents - the number of components of one voxel
 * @param {{volumeId?: string}} context - what the mapper knows, for the message
 * @returns {boolean} true when the device can hold the texture
 */
export default function gridFitsProfile(
  dims,
  dataType,
  numberOfComponents,
  context
) {
  let numBytes = 4 * (numberOfComponents || 1);

  try {
    ({ numBytes } = getBufferConfiguration(dataType, numberOfComponents || 1, {
      isVolumeBuffer: true,
    }));
  } catch {
    // A type that the volume buffer does not name counts as float.
  }
  const profile = profileForGrid(
    getActiveGpuCapabilityProfile(),
    dims,
    numBytes
  );
  const limits = gridLimitsOfProfile(profile, numBytes);
  const grid = {
    dimensions: [dims[0], dims[1], dims[2]],
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  };

  if (voxelGridWithinLimits(grid, limits)) {
    return true;
  }

  log.warn(
    `the profile ${profile.id} cannot hold a texture of ${dims[0]}x${dims[1]}x${dims[2]} for the volume ${context?.volumeId}, so no allocation is issued`
  );

  return false;
}
