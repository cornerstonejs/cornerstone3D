import { RenderingEngine, VolumeViewport } from '../'
import { IVolumeInput } from '../../types'

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
