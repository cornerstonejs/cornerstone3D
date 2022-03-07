import { RenderingEngine, VolumeViewport } from '../'
import { IVolumeInput } from '../../types'

/**
 * Similar to {@link addVolumesOnViewports} it adds volumes to viewports; however,
 * this method will Set the volumes on the viewports which means that the previous
 * volumes will be removed.
 *
 * @param renderingEngine - The rendering engine to use to get viewports from
 * @param volumeInputs - Array of volume inputs including volumeUID. Other properties
 * such as visibility, callback, blendMode, slabThickness are optional
 * @param viewportUIDs - Array of viewport UIDs to add the volume to
 * @param immediateRender - If true, the volumes will be rendered immediately
 * @returns A promise that resolves when all volumes have been added
 */
async function setVolumesOnViewports(
  renderingEngine: RenderingEngine,
  volumeInputs: Array<IVolumeInput>,
  viewportUIDs: Array<string>,
  immediateRender = false
): Promise<void> {
  // Check if all viewports are volumeViewports
  viewportUIDs.forEach((viewportUID) => {
    const viewport = renderingEngine.getViewport(viewportUID)

    if (!viewport) {
      throw new Error(`Viewport with UID ${viewportUID} does not exist`)
    }

    // if not instance of VolumeViewport, throw
    if (!(viewport instanceof VolumeViewport)) {
      throw new Error('setVolumesOnViewports only supports VolumeViewport')
    }
  })

  const setVolumePromises = viewportUIDs.map(async (viewportUID) => {
    const viewport = renderingEngine.getViewport(viewportUID) as VolumeViewport

    await viewport.setVolumes(volumeInputs, immediateRender)
  })

  await Promise.all(setVolumePromises)

  return
}

export default setVolumesOnViewports
