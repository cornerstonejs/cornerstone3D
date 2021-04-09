import { getRenderingEngines } from '@cornerstone'

const autoLoad = (volumeUID) => {
  const { renderingEngine, sceneUIDs } = getRenderingEngineContainingVolume(
    volumeUID
  )

  if (
    !renderingEngine ||
    renderingEngine.hasBeenDestroyed ||
    !sceneUIDs.length
  ) {
    return
  }

  renderingEngine.renderScenes(sceneUIDs)
}

function getRenderingEngineContainingVolume(volumeUID) {
  const renderingEngines = getRenderingEngines()

  for (let i = 0; i < renderingEngines.length; i++) {
    const renderingEngine = renderingEngines[i]
    // TODO: Switch to viewport search
    const scenes = renderingEngine.getScenes()

    const sceneUIDs = []

    scenes.forEach((scene) => {
      if (!scene.getVolumeActors) return
      const volumeActors = scene.getVolumeActors()

      const hasVolume = volumeActors.some((va) => {
        return va.uid === volumeUID
      })

      if (hasVolume) {
        sceneUIDs.push(scene.uid)
      }
    })

    if (sceneUIDs.length) {
      return { renderingEngine, sceneUIDs }
    }
  }

  return { renderingEngine: undefined, sceneUIDs: [] }
}

export default autoLoad
