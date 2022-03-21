import {
  getRenderingEngines,
  RenderingEngine,
  getVolumeViewportsContainingVolumeUID,
} from '@precisionmetrics/cornerstone-render'

type RenderingEngineAndViewportUIDs = {
  renderingEngine: RenderingEngine | undefined
  viewportUIDs: Array<string>
}

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
    const viewports = getVolumeViewportsContainingVolumeUID(
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
