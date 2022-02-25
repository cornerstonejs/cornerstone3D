import lockedSegmentController from './lockedSegmentController'
import segmentIndexController from './segmentIndexController'
import activeSegmentationController from './activeSegmentationController'
import segmentationVisibilityController from './segmentationVisibilityController'
import segmentationColorController from './segmentationColorController'
import segmentationConfigController from './segmentationConfigController'
import createNewSegmentationForViewport from './createNewSegmentationForViewport'
import {
  triggerSegmentationStateModified,
  triggerSegmentationGlobalStateModified,
  triggerSegmentationDataModified,
} from './triggerSegmentationEvents'

export {
  createNewSegmentationForViewport,
  lockedSegmentController,
  segmentIndexController,
  activeSegmentationController,
  segmentationVisibilityController,
  segmentationColorController,
  segmentationConfigController,
  triggerSegmentationStateModified,
  triggerSegmentationGlobalStateModified,
  triggerSegmentationDataModified,
}

export default {
  createNewSegmentationForViewport,
  activeSegmentationController,
  //
  segmentationVisibilityController,
  segmentationColorController,

  // Segment index utils
  segmentIndexController,

  // Locked segment index
  lockedSegmentController,

  // Configuration controller
  segmentationConfigController,

  // triggers
  triggerSegmentationStateModified,
  triggerSegmentationGlobalStateModified,
  triggerSegmentationDataModified,
}
