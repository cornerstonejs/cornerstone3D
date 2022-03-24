import triggerSegmentationRender from '../../utilities/triggerSegmentationRender'

import { SegmentationStateModifiedEventType } from '../../types/EventTypes'

/** A function that listens to the `segmentationStateModified` event and triggers
 * the `triggerSegmentationRender` function. This function is called when the
 * segmentation state or config is modified.
 */
const segmentationStateModifiedEventListener = function (
  evt: SegmentationStateModifiedEventType
): void {
  const { toolGroupId } = evt.detail
  triggerSegmentationRender(toolGroupId)
}

export default segmentationStateModifiedEventListener
