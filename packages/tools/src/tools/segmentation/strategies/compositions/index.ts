import determineSegmentIndex from './determineSegmentIndex';
import dynamicThreshold from './dynamicThreshold';
import erase from './erase';
import islandRemoval from './islandRemovalComposition';
import preview from './preview';
import regionFill from './regionFill';
import setValue from './setValue';
import threshold from './threshold';
import labelmapStatistics from './labelmapStatistics';

import ensureSegmentationVolumeFor3DManipulation from './ensureSegmentationVolume';
import ensureImageVolumeFor3DManipulation from './ensureImageVolume';
import type { EnsureImageVolumeData } from './ensureImageVolume';
import type { EnsureSegmentationVolumeData } from './ensureSegmentationVolume';

const compositions = {
  determineSegmentIndex,
  dynamicThreshold,
  erase,
  islandRemoval,
  preview,
  regionFill,
  setValue,
  threshold,
  labelmapStatistics,
  ensureSegmentationVolumeFor3DManipulation,
  ensureImageVolumeFor3DManipulation,
};

export default compositions;

export type { EnsureImageVolumeData, EnsureSegmentationVolumeData };
