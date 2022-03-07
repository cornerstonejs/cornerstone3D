import VolumeViewport from '../VolumeViewport'
import { getRenderingEngines, getRenderingEngine } from '../getRenderingEngine'

/**
 * Similar to {@link getVolumeViewportsContainingSameVolumes}, but uses the volumeUID
 * to filter viewports that contain the same volume.
 *
 * @returns VolumeViewport viewports array
 */
function getVolumeViewportsContainingVolumeUID(
  uid: string,
  renderingEngineUID?: string
): Array<VolumeViewport> {
  // If rendering engine is not provided, use all rendering engines
  let renderingEngines
  if (renderingEngineUID) {
    renderingEngines = [getRenderingEngine(renderingEngineUID)]
  } else {
    renderingEngines = getRenderingEngines()
  }

  const sameVolumeViewports = []

  renderingEngines.forEach((renderingEngine) => {
    const viewports = renderingEngine.getVolumeViewports()
    const filteredViewports = viewports.filter((vp) => {
      const volActors = vp.getDefaultActor()
      return volActors.volumeActor && volActors.uid === uid
    })
    sameVolumeViewports.push(...filteredViewports)
  })

  return sameVolumeViewports
}

export default getVolumeViewportsContainingVolumeUID
