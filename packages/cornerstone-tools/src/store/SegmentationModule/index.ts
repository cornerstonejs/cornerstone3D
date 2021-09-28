import setLabelmapForElement, {
  getActiveLabelmapForElement,
  getLabelmapForElement,
} from './setLabelmapForElement'
import {
  setActiveLabelmapIndex,
  setActiveLabelmapIndexByLabelmapUID,
  getActiveLabelmapIndex,
  getNextLabelmapIndex,
} from './activeLabelmapIndex'
import {
  setActiveSegmentIndex,
  getActiveSegmentIndex,
} from './activeSegmentIndex'
import {
  getSegmentationConfig,
  setSegmentationConfig,
} from './segmentationConfig'
import { addNewLabelmap } from './addNewLabelmap'
import {
  getLabelmapUIDsForElement,
  getLabelmapUIDsForViewportUID,
} from './getLabelmapUIDsForElement'

export {
  setLabelmapForElement,
  getActiveLabelmapForElement,
  getLabelmapForElement,
  getSegmentationConfig,
  setSegmentationConfig,
  setActiveLabelmapIndex,
  setActiveLabelmapIndexByLabelmapUID,
  getActiveLabelmapIndex,
  addNewLabelmap,
  getActiveSegmentIndex,
  getNextLabelmapIndex,
}

export default {
  // Set labelmap for element
  setLabelmapForElement,
  addNewLabelmap,

  // Set/Get Labelmap
  getLabelmapForElement,
  getLabelmapUIDsForElement,
  getLabelmapUIDsForViewportUID,

  // Set/Get Active labelmap/Index
  getActiveLabelmapForElement,
  setActiveLabelmapIndexByLabelmapUID,
  setActiveLabelmapIndex,
  getActiveLabelmapIndex,

  // Set/Get Active Segment index
  setActiveSegmentIndex,
  getActiveSegmentIndex,

  // Config
  getSegmentationConfig,
  setSegmentationConfig,

  // Utils
  getNextLabelmapIndex,
}
