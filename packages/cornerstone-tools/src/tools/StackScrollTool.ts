import { getEnabledElementByUIDs } from '@precisionmetrics/cornerstone-render'
import { BaseTool } from './base'
import { scrollThroughStack } from '../util/stackScrollTool'

export default class StackScrollTool extends BaseTool {
  touchDragCallback: () => void
  mouseDragCallback: () => void
  _configuration: any

  // Apparently TS says super _must_ be the first call? This seems a bit opinionated.
  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'StackScroll',
      invert: false,
      supportedInteractionTypes: ['Mouse', 'Touch'],
    })

    this.touchDragCallback = this._dragCallback.bind(this)
    this.mouseDragCallback = this._dragCallback.bind(this)
  }

  _dragCallback(evt) {
    const { deltaPoints, viewportUID, renderingEngineUID } = evt.detail
    const deltaFrames = deltaPoints.canvas[1]
    const { viewport } = getEnabledElementByUIDs(
      renderingEngineUID,
      viewportUID
    )
    const volumeUID = this.getTargetUID(viewport)
    const { invert } = this.configuration

    scrollThroughStack(evt, deltaFrames, volumeUID, invert)
  }
}
