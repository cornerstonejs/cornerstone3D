import {
  getEnabledElement,
  addVolumesToViewports,
} from '@cornerstonejs/core'

import SegmentationRepresentations from '../../../enums/SegmentationRepresentations'
import { ToolGroupSpecificSegmentationData } from '../../../types/SegmentationStateTypes'

/**
 * It adds a segmentation data to the viewport's HTML Element. NOTE: This function
 * should not be called directly. You should use addSegmentationToToolGroup instead.
 * Remember that segmentations are not added directly to the viewport's HTML Element,
 * you should create a toolGroup on the viewports and add the segmentation to the
 * toolGroup.
 *
 * @param element - The element that will be rendered.
 * @param segmentationData - ToolGroupSpecificSegmentationData
 *
 * @internal
 */
async function internalAddSegmentationToElement(
  element: HTMLElement,
  segmentationData: ToolGroupSpecificSegmentationData
): Promise<void> {
  if (!element || !segmentationData) {
    throw new Error('You need to provide an element and a segmentation')
  }

  const enabledElement = getEnabledElement(element)
  const { renderingEngine, viewport } = enabledElement
  const { uid: viewportUID } = viewport

  // Default to true since we are setting a new segmentation, however,
  // in the event listener, we will make other segmentations visible/invisible
  // based on the config
  const visibility = true

  const { representation, segmentationDataUID } = segmentationData

  if (representation.type === SegmentationRepresentations.Labelmap) {
    const { volumeUID } = segmentationData
    // Add labelmap volumes to the viewports to be be rendered, but not force the render
    await addVolumesToViewports(
      renderingEngine,
      [
        {
          volumeUID,
          actorUID: segmentationDataUID,
          visibility,
        },
      ],
      [viewportUID]
    )
  } else {
    throw new Error('Only labelmap representation is supported for now')
  }
}

export default internalAddSegmentationToElement
