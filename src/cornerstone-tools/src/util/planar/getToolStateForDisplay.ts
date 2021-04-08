import getTargetVolume from './getTargetVolume'
import getToolStateWithinSlice from './getToolStateWithinSlice'
import { Types } from '@cornerstone'
import { VIEWPORT_TYPE } from '@cornerstone'

//const { IViewport } = Types;

export default function getToolStateForDisplay(viewport: IViewport, toolState) {
  if (viewport.type === VIEWPORT_TYPE.STACK) {
    // 1. Get the currently displayed imageId from the StackViewport
    const imageId = viewport.getCurrentImageId()

    // 2. Filter tool data in the frame of reference by the referenced image ID property
    return toolState.filter((toolData) => {
      return toolData.metadata.referencedImageId === imageId
    })
  } else if (viewport.type === VIEWPORT_TYPE.ORTHOGRAPHIC) {
    const scene = viewport.getScene()
    const camera = viewport.getCamera()

    const { spacingInNormalDirection } = getTargetVolume(scene, camera)

    // Get data with same normal
    return getToolStateWithinSlice(toolState, camera, spacingInNormalDirection)
  } else {
    throw new Error(`Viewport Type ${viewport.type} not supported`)
  }
}
