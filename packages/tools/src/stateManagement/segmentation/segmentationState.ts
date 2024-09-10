import { getSegmentation } from './getSegmentation';
import { getSegmentations } from './getSegmentations';
import { addSegmentations } from './addSegmentations';
import { removeSegmentation } from './removeSegmentation';
import {
  removeLabelmapRepresentation,
  removeContourRepresentation,
  removeSurfaceRepresentation,
  removeSegmentationRepresentation,
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
  getAllSegmentationRepresentations,
  getSegmentationRepresentation,
  getSegmentationRepresentations,
} from './getSegmentationRepresentation';

export {
  // get
  getColorLUT,
  getCurrentLabelmapImageIdForViewport,
  getNextColorLUTIndex,
  getSegmentation,
  getSegmentations,
  getStackSegmentationImageIdsForViewport,
  getViewportIdsWithSegmentation,
  getAllSegmentationRepresentations,
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
  // add
  addColorLUT,
  addSegmentations,
  // update
  updateLabelmapSegmentationImageReferences,
  // style
};
