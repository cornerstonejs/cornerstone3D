import {
  getEnabledElement,
  VolumeViewport,
} from '@precisionmetrics/cornerstone-render'
import { ToolGroupSpecificSegmentationData } from '../../types/SegmentationStateTypes'
import SegmentationRepresentations from '../../enums/SegmentationRepresentations'

/**
 * Remove the segmentation from the viewport's HTML Element.
 * NOTE: This function should not be called directly. You should use removeSegmentationFromToolGroup instead.
 * Remember that segmentations are not removed directly to the viewport's HTML Element,
 * you should use the toolGroups to do that
 *
 * @param element - The element that the segmentation is being added
 * to.
 * @param segmentationData - ToolGroupSpecificSegmentationData
 * @param removeFromCache - boolean
 *
 * @internal
 */
function removeSegmentationFromElement(
  element: HTMLElement,
  segmentationData: ToolGroupSpecificSegmentationData,
  removeFromCache = false // Todo
): void {
  const enabledElement = getEnabledElement(element)
  const { viewport } = enabledElement

  const { representation, segmentationDataUID } = segmentationData

  if (representation.type === SegmentationRepresentations.Labelmap) {
    ;(viewport as VolumeViewport).removeVolumeActors([segmentationDataUID])
  } else {
    throw new Error('Only labelmap representation is supported for now')
  }
}

export default removeSegmentationFromElement
