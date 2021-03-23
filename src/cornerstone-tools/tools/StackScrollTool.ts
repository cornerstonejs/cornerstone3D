import { BaseTool } from './base/index'
import { scrollThroughStack } from '../util/stackScrollTool'

export default class StackScrollTool extends BaseTool {
  touchDragCallback: () => void
  mouseDragCallback: () => void
  _configuration: any

  // Apparently TS says super _must_ be the first call? This seems a bit opinionated.
  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'StackScroll',
      supportedInteractionTypes: ['Mouse', 'Touch'],
    })

    this.touchDragCallback = this._dragCallback.bind(this)
    this.mouseDragCallback = this._dragCallback.bind(this)
  }

  _dragCallback(evt) {
    const { deltaPoints } = evt.detail
    const deltaFrames = deltaPoints.canvas[1]
    const { volumeUID } = this.configuration

    scrollThroughStack(evt, deltaFrames, volumeUID)
  }
}
