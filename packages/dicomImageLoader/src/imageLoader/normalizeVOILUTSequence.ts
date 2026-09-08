import { utilities } from '@cornerstonejs/core';

/**
 * Normalizes a VOI LUT Sequence (0028,3010) into the shape the renderers
 * consume. The function itself is in the core package, because the volume path
 * needs it also (refer to `setDefaultVolumeVOI`). This module keeps the import
 * path that the image loader uses.
 */
export default utilities.normalizeVOILUTSequence;
