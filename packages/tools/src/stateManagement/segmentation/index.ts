import removeSegmentationsFromToolGroup from './removeSegmentationsFromToolGroup.js';
import addSegmentations from './addSegmentations.js';
import addSegmentationRepresentations from './addSegmentationRepresentations.js';
import addRepresentationData from './addRepresentationData.js';
import { convertStackToVolumeSegmentation } from './convertStackToVolumeSegmentation.js';
import { convertVolumeToStackSegmentation } from './convertVolumeToStackSegmentation.js';
// import { polySegManager } from './polySegManager';

import * as activeSegmentation from './activeSegmentation.js';
import * as segmentLocking from './segmentLocking.js';
import * as state from './segmentationState.js';
import * as config from './config/index.js';
import * as segmentIndex from './segmentIndex.js';
import * as triggerSegmentationEvents from './triggerSegmentationEvents.js';
import * as polySegManager from './polySeg/index.js';

export {
  // functions
  addSegmentations,
  addSegmentationRepresentations,
  removeSegmentationsFromToolGroup,
  addRepresentationData,
  // name spaces
  state,
  activeSegmentation,
  segmentLocking,
  config,
  segmentIndex,
  triggerSegmentationEvents,
  convertStackToVolumeSegmentation,
  convertVolumeToStackSegmentation,
  polySegManager as polySeg,
};
