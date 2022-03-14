import {
  StackViewport,
  VolumeViewport,
  Types,
  Utilities as csUtils,
} from '@precisionmetrics/cornerstone-render'

import filterToolStateWithinSlice from './filterToolStateWithinSlice'
import { ToolSpecificToolState } from '../../types'

/**
 * Given the viewport and the toolState, it filters the toolState array and only
 * return those toolData that should be displayed on the viewport
 * @param toolState - ToolSpecificToolState
 * @returns A filtered version of the toolState.
 */
export default function filterToolStateForDisplay(
  viewport: Types.IViewport,
  toolState: ToolSpecificToolState
): ToolSpecificToolState {
  if (viewport instanceof StackViewport) {
    // 1. Get the currently displayed imageId from the StackViewport
    const imageId = viewport.getCurrentImageId()

    // 2. remove the dataLoader scheme since it might be an annotation that was
    // created on the volumeViewport initially and has the volumeLoader scheme
    // but shares the same imageId
    const colonIndex = imageId.indexOf(':')
    const imageURI = imageId.substring(colonIndex + 1)

    // 3. Filter tool data in the frame of reference by the referenced image ID property
    return toolState.filter((toolData) => {
      return toolData.metadata.referencedImageId === imageURI
    })
  } else if (viewport instanceof VolumeViewport) {
    const camera = viewport.getCamera()

    const { spacingInNormalDirection } =
      csUtils.getTargetVolumeAndSpacingInNormalDir(viewport, camera)

    // Get data with same normal and within the same slice
    return filterToolStateWithinSlice(
      toolState,
      camera,
      spacingInNormalDirection
    )
  } else {
    throw new Error(`Viewport Type ${viewport.type} not supported`)
  }
}
