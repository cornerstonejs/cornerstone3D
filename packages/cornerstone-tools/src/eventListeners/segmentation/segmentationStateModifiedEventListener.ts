import triggerSegmentationRender from '../../util/triggerSegmentationRender'

import { SegmentationStateModifiedEvent } from '../../types/SegmentationEventTypes'

/** A function that listens to the `segmentationStateModified` event and triggers
 * the `triggerSegmentationRender` function. This function is called when the
 * segmentation state or config is modified.
 */
const segmentationStateModifiedEventListener = function (
  evt: SegmentationStateModifiedEvent
): void {
  const { toolGroupUID } = evt.detail
  triggerSegmentationRender(toolGroupUID)
}

export default segmentationStateModifiedEventListener
