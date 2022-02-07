import setLabelmapForElement from './setLabelmapForElement'
import {
  setActiveLabelmapIndex,
  setActiveLabelmapByLabelmapUID,
  getActiveLabelmapIndex,
  getActiveLabelmapUID,
  getNextLabelmapIndex,
} from './activeLabelmapIndex'
import { getLabelmapUIDsForElement, getLabelmapUIDForElement } from './utils'
import {
  setActiveSegmentIndex,
  getActiveSegmentIndex,
  getActiveSegmentIndexForLabelmapUID,
} from './activeSegmentIndex'
import * as segmentLocker from './segmentLocker'
import config, { setGlobalConfig } from './segmentationConfig'
import { addNewLabelmap } from './addNewLabelmap'
import { setColorLUT, getColorForSegmentIndex } from './colorLUT'

export {
  setLabelmapForElement,
  setActiveLabelmapIndex,
  setActiveLabelmapByLabelmapUID,
  getActiveLabelmapIndex,
  getActiveLabelmapUID,
  addNewLabelmap,
  getActiveSegmentIndex,
  getLabelmapUIDForElement,
  getNextLabelmapIndex,
  setColorLUT,
  getColorForSegmentIndex,
  getActiveSegmentIndexForLabelmapUID,
  config,
  setGlobalConfig,
  segmentLocker,
}

export default {
  // Set labelmap for element
  setLabelmapForElement,
  addNewLabelmap,

  // Set/Get Labelmap
  getLabelmapUIDsForElement,

  // Set/Get Active labelmap/Index
  setActiveLabelmapByLabelmapUID,
  setActiveLabelmapIndex,
  getActiveLabelmapIndex,
  getActiveLabelmapUID,

  // Set/Get Active Segment index
  setActiveSegmentIndex,
  getActiveSegmentIndex,

  // Config
  config,
  setGlobalConfig,

  // ColorLUT
  setColorLUT,
  getColorForSegmentIndex,

  // Utils
  getNextLabelmapIndex,
  getActiveSegmentIndexForLabelmapUID,
  getLabelmapUIDForElement,

  // Locked segment index
  segmentLocker,
}
