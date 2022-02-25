import {
  getGlobalSegmentationState,
  getGlobalSegmentationDataByUID,
  getSegmentationState,
  getColorLut,
  getToolGroupsWithSegmentation,
  getSegmentationDataByUID,
} from './segmentationState'

import * as SegmentationState from './segmentationState'

import addSegmentationsForToolGroup from './addSegmentationsForToolGroup'
import removeSegmentationsForToolGroup from './removeSegmentationsForToolGroup'

export {
  getGlobalSegmentationState,
  getGlobalSegmentationDataByUID,
  getSegmentationState,
  getColorLut,
  getToolGroupsWithSegmentation,
  getSegmentationDataByUID,
  //
  addSegmentationsForToolGroup,
  removeSegmentationsForToolGroup,
  SegmentationState,
}
