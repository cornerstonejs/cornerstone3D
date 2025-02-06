import determineSegmentIndex from './determineSegmentIndex';
import dynamicThreshold from './dynamicThreshold';
import erase from './erase';
import islandRemoval from './islandRemovalComposition';
import preview from './preview';
import regionFill from './regionFill';
import setValue from './setValue';
import threshold from './threshold';
import labelmapStatistics from './labelmapStatistics';
import labelmapInterpolation from './labelmapInterpolation';
import ensureSegmentationVolumeFor3DManipulation from './ensureSegmentationVolume';
import ensureImageVolumeFor3DManipulation from './ensureImageVolume';

export default {
  determineSegmentIndex,
  dynamicThreshold,
  erase,
  islandRemoval,
  preview,
  regionFill,
  setValue,
  threshold,
  labelmapStatistics,
  labelmapInterpolation,
  ensureSegmentationVolumeFor3DManipulation,
  ensureImageVolumeFor3DManipulation,
};
