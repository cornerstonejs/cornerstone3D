import setLabelmapForElement from './setLabelmapForElement'

import { getLabelmapUIDsForElement, getLabelmapUIDForElement } from './utils'
import * as lockedSegmentController from './lockedSegmentController'
import * as segmentIndexController from './segmentIndexController'
import * as activeLabelmapController from './activeLabelmapController'
import * as hideSegmentController from './hideSegmentController'
import config, { setGlobalConfig } from './segmentationConfig'
import { addNewLabelmap } from './addNewLabelmap'
import { setColorLUT, getColorForSegmentIndex } from './colorLUT'

export {
  setLabelmapForElement,
  addNewLabelmap,
  getLabelmapUIDForElement,
  setColorLUT,
  getColorForSegmentIndex,
  config,
  setGlobalConfig,
  lockedSegmentController,
  segmentIndexController,
  activeLabelmapController,
  hideSegmentController,
}

export default {
  // Set labelmap for element
  setLabelmapForElement,
  addNewLabelmap,

  // Set/Get Labelmap
  getLabelmapUIDsForElement,

  // active labelmap utils
  activeLabelmapController,

  //
  hideSegmentController,

  // Segment index utils
  segmentIndexController,

  // Config
  config,
  setGlobalConfig,

  // ColorLUT
  setColorLUT,
  getColorForSegmentIndex,

  // Utils
  getLabelmapUIDForElement,

  // Locked segment index
  lockedSegmentController,
}
