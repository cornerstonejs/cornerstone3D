import { getEnabledElement } from '@cornerstonejs/core'
import type { Types } from '@cornerstonejs/core'

/**
 * Remove the labelmap segmentation representation from the viewport's HTML Element.
 * NOTE: This function should not be called directly.
 *
 * @param element - The element that the segmentation is being added to.
 * @param segmentationData - ToolGroupSpecificSegmentationData
 * @param removeFromCache - boolean
 *
 * @internal
 */
function removeSegmentationRepresentationFromElement(
  element: HTMLElement,
  segmentationRepresentationUID: string,
  removeFromCache = false // Todo
): void {
  const enabledElement = getEnabledElement(element)
  const { viewport } = enabledElement

  ;(viewport as Types.IVolumeViewport).removeVolumeActors([
    segmentationRepresentationUID,
  ])
}

export default removeSegmentationRepresentationFromElement
