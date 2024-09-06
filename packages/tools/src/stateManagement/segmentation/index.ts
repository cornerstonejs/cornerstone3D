import {
  removeSegmentationRepresentations,
  removeSegmentationRepresentationsFromViewport,
} from './removeSegmentationRepresentations';
import addSegmentations from './addSegmentations';
import {
  addSegmentationRepresentations,
  addMultiViewportSegmentationRepresentations,
} from './addSegmentationRepresentations';
import addRepresentationData from './addRepresentationData';
import { convertVolumeToStackSegmentation } from './helpers/convertVolumeToStackSegmentation';
import * as activeSegmentation from './activeSegmentation';
import * as segmentLocking from './segmentLocking';
import * as state from './segmentationState';
import * as config from './config';
import * as segmentIndex from './segmentIndex';
import * as triggerSegmentationEvents from './triggerSegmentationEvents';
import { convertStackToVolumeSegmentation } from './helpers/convertStackToVolumeSegmentation';
import { computeVolumeSegmentationFromStack } from './helpers/computeVolumeSegmentationFromStack';
import * as polySegManager from './polySeg';
import { clearSegmentValue } from './helpers/clearSegmentValue';

const helpers = {
  clearSegmentValue,
  convertStackToVolumeSegmentation,
  computeVolumeSegmentationFromStack,
  convertVolumeToStackSegmentation,
};

export {
  // functions
  addSegmentations,
  addSegmentationRepresentations,
  addMultiViewportSegmentationRepresentations,
  removeSegmentationRepresentations,
  removeSegmentationRepresentationsFromViewport,
  addRepresentationData,
  // name spaces
  state,
  activeSegmentation,
  segmentLocking,
  config,
  segmentIndex,
  triggerSegmentationEvents,
  helpers,
  polySegManager as polySeg,
};
