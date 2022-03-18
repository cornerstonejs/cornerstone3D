import {
  getRenderingEngines,
  RenderingEngine,
  utilities,
} from '@precisionmetrics/cornerstone-render'

type RenderingEngineAndViewportUIDs = {
  renderingEngine: RenderingEngine | undefined
  viewportUIDs: Array<string>
}

/**
 * Given a volumeUID, it finds the viewports and renderingEngines that
 * include that volume, and triggers a render if renderingEngine is available.
 *
 * @param volumeUID - The UID of the volume
 */
const autoLoad = (volumeUID: string): void => {
  const renderingEngineAndViewportUIDs =
    getRenderingEngineAndViewportsContainingVolume(volumeUID)

  if (
    !renderingEngineAndViewportUIDs ||
    !renderingEngineAndViewportUIDs.length
  ) {
    return
  }

  renderingEngineAndViewportUIDs.forEach(
    ({ renderingEngine, viewportUIDs }) => {
      if (!renderingEngine.hasBeenDestroyed) {
        renderingEngine.renderViewports(viewportUIDs)
      }
    }
  )
}

function getRenderingEngineAndViewportsContainingVolume(
  volumeUID: string
): Array<RenderingEngineAndViewportUIDs> {
  const renderingEnginesArray = getRenderingEngines()

  const renderingEngineAndViewportUIDs = []

  for (let i = 0; i < renderingEnginesArray.length; i++) {
    const renderingEngine = renderingEnginesArray[i]
    const viewports = utilities.getVolumeViewportsContainingVolumeUID(
      volumeUID,
      renderingEngine.uid
    )

    if (viewports.length) {
      renderingEngineAndViewportUIDs.push({
        renderingEngine,
        viewportUIDs: viewports.map((viewport) => viewport.uid),
      })
    }
  }

  return renderingEngineAndViewportUIDs
}

export default autoLoad
