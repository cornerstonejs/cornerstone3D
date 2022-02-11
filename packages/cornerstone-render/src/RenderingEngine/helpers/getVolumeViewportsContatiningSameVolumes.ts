import VolumeViewport from '../VolumeViewport'
import { getRenderingEngines, getRenderingEngine } from '../getRenderingEngine'

/**
 * Returns the viewport containing the same volume actor
 * as the provided target viewport.
 * @param viewport target viewport
 * @returns {Array<VolumeViewport>} array of viewports that have the same volume actor as the target viewport
 */
function getVolumeViewportsContatiningSameVolumes(
  targetViewport: VolumeViewport,
  renderingEngineUID?: string
): Array<VolumeViewport> {
  // If rendering engine is not provided, use all rendering engines
  let renderingEngines
  if (renderingEngineUID) {
    renderingEngines = [getRenderingEngine(renderingEngineUID)]
  } else {
    renderingEngines = getRenderingEngines()
  }

  const sameVolumesViewports = []

  renderingEngines.forEach((renderingEngine) => {
    const targetActors = targetViewport.getActors()
    const viewports = renderingEngine.getVolumeViewports()

    for (const vp of viewports) {
      const vpActors = vp.getActors()

      if (vpActors.length !== targetActors.length) {
        continue
      }

      // every targetActors should be in the vpActors
      const sameVolumes = targetActors.every(({ uid }) =>
        vpActors.find((vpActor) => uid === vpActor.uid)
      )

      if (sameVolumes) {
        sameVolumesViewports.push(vp)
      }
    }
  })

  return sameVolumesViewports
}

export default getVolumeViewportsContatiningSameVolumes
