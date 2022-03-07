import {
  StackViewport,
  VolumeViewport,
  Types,
} from '@precisionmetrics/cornerstone-render'

import getTargetVolume from './getTargetVolume'
import getToolStateWithinSlice from './getToolStateWithinSlice'
import { ToolSpecificToolState } from '../../types'

export default function getToolStateForDisplay(
  viewport: Types.IViewport,
  toolState: ToolSpecificToolState
): ToolSpecificToolState {
  if (viewport instanceof StackViewport) {
    // 1. Get the currently displayed imageId from the StackViewport
    const imageId = viewport.getCurrentImageId()

    // 2. remove the dataLoader scheme
    const colonIndex = imageId.indexOf(':')
    const imageURI = imageId.substring(colonIndex + 1)

    // 3. Filter tool data in the frame of reference by the referenced image ID property
    return toolState.filter((toolData) => {
      return toolData.metadata.referencedImageId === imageURI
    })
  } else if (viewport instanceof VolumeViewport) {
    const camera = viewport.getCamera()

    const { spacingInNormalDirection } = getTargetVolume(viewport, camera)

    // Get data with same normal
    return getToolStateWithinSlice(toolState, camera, spacingInNormalDirection)
  } else {
    throw new Error(`Viewport Type ${viewport.type} not supported`)
  }
}
