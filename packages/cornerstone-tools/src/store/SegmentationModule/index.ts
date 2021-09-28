import setLabelmapForElement, {
  getActiveLabelmapForElement,
  getLabelmapForElement,
} from './setLabelmapForElement'
import {
  setActiveLabelmapIndex,
  getActiveLabelmapIndex,
} from './activeLabelmapIndex'
import {
  setActiveSegmentIndex,
  getActiveSegmentIndex,
} from './activeSegmentIndex'
import {
  getSegmentationConfig,
  setSegmentationConfig,
} from './segmentationConfig'
import { addNewLabelmap, getNextLabelmapIndex } from './addNewLabelmap'

export {
  setLabelmapForElement,
  getActiveLabelmapForElement,
  getLabelmapForElement,
  getSegmentationConfig,
  setSegmentationConfig,
  setActiveLabelmapIndex,
  getActiveLabelmapIndex,
  addNewLabelmap,
  getNextLabelmapIndex,
}

export default {
  // Set labelmap for element
  setLabelmapForElement,
  addNewLabelmap,

  // Set/Get Labelmap
  getLabelmapForElement,

  // Set/Get Active labelmap/Index
  getActiveLabelmapForElement,
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
