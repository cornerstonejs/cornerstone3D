import getTargetVolume from './getTargetVolume'
import getToolStateWithinSlice from './getToolStateWithinSlice'
import { StackViewport, VIEWPORT_TYPE, VolumeViewport } from '@cornerstone'
import IViewport from 'src/cornerstone-core/src/types/IViewport'

// const { ICamera } = Types

export default function getToolStateForDisplay(viewport: IViewport, toolState) {
  if (viewport instanceof StackViewport) {
    // 1. Get the currently displayed imageId from the StackViewport
    let imageId = viewport.getCurrentImageId()

    // 2. remove the dataLoader scheme
    const colonIndex = imageId.indexOf(':')
    imageId = imageId.substring(colonIndex + 1)

    // 3. Filter tool data in the frame of reference by the referenced image ID property
    return toolState.filter((toolData) => {
      return toolData.metadata.referencedImageId === imageId
    })
  } else if (viewport instanceof VolumeViewport) {
    const scene = viewport.getScene()
    const camera = viewport.getCamera()

    const { spacingInNormalDirection } = getTargetVolume(scene, camera)

    // Get data with same normal
    return getToolStateWithinSlice(toolState, camera, spacingInNormalDirection)
  } else {
    throw new Error(`Viewport Type ${viewport.type} not supported`)
  }
}
