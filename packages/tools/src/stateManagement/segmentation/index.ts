import {
  removeContourRepresentation,
  removeLabelmapRepresentation,
  removeSegmentationRepresentation,
  removeSurfaceRepresentation,
} from './removeSegmentationRepresentations';

import {
  addContourRepresentationToViewport,
  addContourRepresentationToViewportMap,
  addSurfaceRepresentationToViewport,
  addSurfaceRepresentationToViewportMap,
  addLabelmapRepresentationToViewport,
  addLabelmapRepresentationToViewportMap,
  addSegmentationRepresentations,
} from './addSegmentationRepresentationsToViewport';

import { addSegmentations } from './addSegmentations';
import * as activeSegmentation from './activeSegmentation';
import * as segmentLocking from './segmentLocking';
import * as state from './segmentationState';
import * as config from './config';
import * as segmentIndex from './segmentIndex';
import * as triggerSegmentationEvents from './triggerSegmentationEvents';
import { convertStackToVolumeLabelmap } from './helpers/convertStackToVolumeLabelmap';
import { computeVolumeLabelmapFromStack } from './helpers/computeVolumeLabelmapFromStack';
import * as polySegManager from './polySeg';
import { clearSegmentValue } from './helpers/clearSegmentValue';
import { convertVolumeToStackLabelmap } from './helpers/computeStackLabelmapFromVolume';

const helpers = {
  clearSegmentValue,
  convertStackToVolumeLabelmap,
  computeVolumeLabelmapFromStack,
  convertVolumeToStackLabelmap,
};

export {
  // functions
  removeSegmentationRepresentation,
  removeContourRepresentation,
  removeLabelmapRepresentation,
  removeSurfaceRepresentation,
  addLabelmapRepresentationToViewport,
  addLabelmapRepresentationToViewportMap,
  addSegmentationRepresentations,
  addContourRepresentationToViewport,
  addContourRepresentationToViewportMap,
  addSurfaceRepresentationToViewport,
  addSurfaceRepresentationToViewportMap,
  addSegmentations,
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
