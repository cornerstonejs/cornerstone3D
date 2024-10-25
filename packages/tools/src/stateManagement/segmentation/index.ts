import {
  removeContourRepresentation,
  removeLabelmapRepresentation,
  removeSegmentationRepresentation,
  removeSurfaceRepresentation,
  removeSegmentationRepresentations,
  removeAllSegmentationRepresentations,
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
import { updateSegmentations } from './updateSegmentations';
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
import { removeSegment } from './removeSegment';
import { getLabelmapImageIds } from './getLabelmapImageIds';

import {
  removeAllSegmentations,
  removeSegmentation,
} from './removeSegmentation';

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
  removeAllSegmentations,
  removeSegmentation,
  removeSegmentationRepresentations,
  addLabelmapRepresentationToViewport,
  addLabelmapRepresentationToViewportMap,
  addSegmentationRepresentations,
  removeAllSegmentationRepresentations,
  addContourRepresentationToViewport,
  addContourRepresentationToViewportMap,
  addSurfaceRepresentationToViewport,
  addSurfaceRepresentationToViewportMap,
  addSegmentations,
  updateSegmentations,
  // name spaces
  state,
  activeSegmentation,
  segmentLocking,
  config,
  segmentIndex,
  triggerSegmentationEvents,
  helpers,
  polySegManager as polySeg,
  removeSegment,
  getLabelmapImageIds,
};
