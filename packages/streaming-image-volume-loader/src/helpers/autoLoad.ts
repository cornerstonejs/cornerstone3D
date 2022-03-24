import { getRenderingEngines, utilities } from '@cornerstonejs/core'

//import type { Types } from '@cornerstonejs/core'

type RenderingEngineAndViewportIds = {
  renderingEngine: any | undefined //Types.IRenderingEngine | undefined
  viewportUIDs: Array<string>
}

/**
 * Given a volumeUID, it finds the viewports and renderingEngines that
 * include that volume, and triggers a render if renderingEngine is available.
 *
 * @param volumeUID - The UID of the volume
 */
const autoLoad = (volumeUID: string): void => {
  const renderingEngineAndViewportIds =
    getRenderingEngineAndViewportsContainingVolume(volumeUID)

  if (!renderingEngineAndViewportIds || !renderingEngineAndViewportIds.length) {
    return
  }

  renderingEngineAndViewportIds.forEach(({ renderingEngine, viewportUIDs }) => {
    if (!renderingEngine.hasBeenDestroyed) {
      renderingEngine.renderViewports(viewportUIDs)
    }
  })
}

function getRenderingEngineAndViewportsContainingVolume(
  volumeUID: string
): Array<RenderingEngineAndViewportIds> {
  const renderingEnginesArray = getRenderingEngines()

  const renderingEngineAndViewportIds = []

  for (let i = 0; i < renderingEnginesArray.length; i++) {
    const renderingEngine = renderingEnginesArray[i]
    const viewports = utilities.getVolumeViewportsContainingVolumeUID(
      volumeUID,
      renderingEngine.uid
    )

    if (viewports.length) {
      renderingEngineAndViewportIds.push({
        renderingEngine,
        viewportUIDs: viewports.map((viewport) => viewport.uid),
      })
    }
  }

  return renderingEngineAndViewportIds
}

export default autoLoad
