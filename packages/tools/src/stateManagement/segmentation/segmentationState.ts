import {
  getSegmentation,
  getSegmentations,
  getSegmentationRepresentations,
  getToolGroupIdsWithSegmentation,
  getToolGroupSpecificConfig,
  getSegmentationRepresentationSpecificConfig,
  getSegmentSpecificRepresentationConfig,
  getGlobalConfig,
  getSegmentationRepresentationByUID,
  getColorLUT,
  getAllSegmentationRepresentations,
  getDefaultSegmentationStateManager,
} from './state/get';

import {
  addSegmentation,
  addSegmentationRepresentation,
  addColorLUT,
} from './state/add';

import {
  removeSegmentation,
  removeSegmentationRepresentation,
  removeColorLUT,
} from './state/remove';

import {
  setToolGroupSpecificConfig,
  setGlobalConfig,
  setSegmentationRepresentationSpecificConfig,
  setSegmentSpecificRepresentationConfig,
} from './state/set';

/*************************
 *
 * Segmentation State
 *
 **************************/

export {
  getDefaultSegmentationStateManager,
  // Segmentation
  getSegmentation,
  getSegmentations,
  addSegmentation,
  removeSegmentation,
  // ToolGroup specific Segmentation Representation
  getSegmentationRepresentations,
  addSegmentationRepresentation,
  removeSegmentationRepresentation,
  // config
  getToolGroupSpecificConfig,
  setToolGroupSpecificConfig,
  getGlobalConfig,
  setGlobalConfig,
  getSegmentationRepresentationSpecificConfig,
  setSegmentationRepresentationSpecificConfig,
  getSegmentSpecificRepresentationConfig,
  setSegmentSpecificRepresentationConfig,
  // helpers s
  getToolGroupIdsWithSegmentation,
  getAllSegmentationRepresentations,
  getSegmentationRepresentationByUID,
  // color
  addColorLUT,
  getColorLUT,
  removeColorLUT,
};
