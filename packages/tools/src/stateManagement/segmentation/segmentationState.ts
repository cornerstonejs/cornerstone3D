import { getSegmentation } from './getSegmentation';
import { getSegmentations } from './getSegmentations';
import { addSegmentation } from './addSegmentation';
import { removeSegmentation } from './removeSegmentation';
import { getAllSegmentationRepresentations } from './getAllSegmentationRepresentations';
import { getSegmentationRepresentation } from './getSegmentationRepresentation';
import {
  removeSegmentationRepresentationsFromViewport,
  removeSegmentationRepresentations,
} from './removeSegmentationRepresentations';
import { getGlobalConfig } from './getGlobalConfig';
import { setGlobalConfig } from './setGlobalConfig';
import { getSegmentationRepresentationConfig } from './getSegmentationRepresentationConfig';
import { setSegmentationRepresentationConfig } from './setSegmentationRepresentationConfig';
import { getPerSegmentConfig } from './getPerSegmentConfig';
import { setPerSegmentConfig } from './setPerSegmentConfig';
import { getSegmentationRepresentations } from './getSegmentationRepresentations';
import { getSegmentationRepresentationViewportStates } from './getSegmentationRepresentationViewportStates';
import { addColorLUT } from './addColorLUT';
import { getColorLUT } from './getColorLUT';
import { getNextColorLUTIndex } from './getNextColorLUTIndex';
import { removeColorLUT } from './removeColorLUT';
import { getSegmentationRepresentationsForSegmentation } from './getSegmentationRepresentationsForSegmentation';
import { getSegmentationRepresentationVisibility } from './getSegmentationRepresentationVisibility';
import { setSegmentationRepresentationVisibility } from './setSegmentationRepresentationVisibility';
import { getViewportIdsWithSegmentation } from './getViewportIdsWithSegmentation';
import { getActiveSegmentationRepresentation } from './getActiveSegmentationRepresentation';
import { setActiveSegmentationRepresentation } from './setActiveSegmentationRepresentation';
import { getCurrentLabelmapImageIdForViewport } from './getCurrentLabelmapImageIdForViewport';
import { updateLabelmapSegmentationImageReferences } from './updateLabelmapSegmentationImageReferences';
import { getStackSegmentationImageIdsForViewport } from './getStackSegmentationImageIdsForViewport';

export {
  // get
  getActiveSegmentationRepresentation,
  getAllSegmentationRepresentations,
  getColorLUT,
  getCurrentLabelmapImageIdForViewport,
  getGlobalConfig,
  getNextColorLUTIndex,
  getPerSegmentConfig,
  getSegmentation,
  getSegmentationRepresentation,
  getSegmentationRepresentationConfig,
  getSegmentationRepresentations,
  getSegmentationRepresentationViewportStates,
  getSegmentationRepresentationsForSegmentation,
  getSegmentationRepresentationVisibility,
  getSegmentations,
  getStackSegmentationImageIdsForViewport,
  getViewportIdsWithSegmentation,
  // set
  setActiveSegmentationRepresentation,
  setGlobalConfig,
  setPerSegmentConfig,
  setSegmentationRepresentationConfig,
  setSegmentationRepresentationVisibility,
  // remove
  removeColorLUT,
  removeSegmentation,
  removeSegmentationRepresentations,
  removeSegmentationRepresentationsFromViewport,
  // add
  addColorLUT,
  addSegmentation,
  // update
  updateLabelmapSegmentationImageReferences,
};
