import { getSegmentation } from './getSegmentation';
import { getSegmentations } from './getSegmentations';
import { addSegmentations } from './addSegmentations';
import {
  removeAllSegmentations,
  removeSegmentation,
} from './removeSegmentation';
import {
  removeLabelmapRepresentation,
  removeContourRepresentation,
  removeSurfaceRepresentation,
  removeSegmentationRepresentation,
  removeAllSegmentationRepresentations,
} from './removeSegmentationRepresentations';

import { addColorLUT } from './addColorLUT';
import { getColorLUT } from './getColorLUT';
import { getNextColorLUTIndex } from './getNextColorLUTIndex';
import { removeColorLUT } from './removeColorLUT';
import { getViewportSegmentations } from './getViewportSegmentations';
import { getViewportIdsWithSegmentation } from './getViewportIdsWithSegmentation';
import { getCurrentLabelmapImageIdForViewport } from './getCurrentLabelmapImageIdForViewport';
import { updateLabelmapSegmentationImageReferences } from './updateLabelmapSegmentationImageReferences';
import { getStackSegmentationImageIdsForViewport } from './getStackSegmentationImageIdsForViewport';
import {
  getSegmentationRepresentation,
  getSegmentationRepresentations,
  getSegmentationRepresentationsBySegmentationId,
} from './getSegmentationRepresentation';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

function destroy() {
  defaultSegmentationStateManager.resetState();
}

export {
  // get
  getColorLUT,
  getCurrentLabelmapImageIdForViewport,
  getNextColorLUTIndex,
  getSegmentation,
  getSegmentations,
  getStackSegmentationImageIdsForViewport,
  getViewportIdsWithSegmentation,
  getSegmentationRepresentation,
  getSegmentationRepresentations,
  // set
  // remove
  removeColorLUT,
  getViewportSegmentations,
  removeSegmentation,
  removeLabelmapRepresentation,
  removeContourRepresentation,
  removeSurfaceRepresentation,
  removeSegmentationRepresentation,
  removeAllSegmentationRepresentations,
  removeAllSegmentations,
  // add
  addColorLUT,
  addSegmentations,
  // update
  updateLabelmapSegmentationImageReferences,
  getSegmentationRepresentationsBySegmentationId,
  destroy,
  // style
};
