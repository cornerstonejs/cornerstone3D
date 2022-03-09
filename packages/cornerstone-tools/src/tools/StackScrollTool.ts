import { getEnabledElementByUIDs } from '@precisionmetrics/cornerstone-render'
import { BaseTool } from './base'
import { scrollThroughStack } from '../util/stackScrollTool'
import { PublicToolProps, ToolProps } from '../types'

export default class StackScrollTool extends BaseTool {
  touchDragCallback: () => void
  mouseDragCallback: () => void
  _configuration: any

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      name: 'StackScroll',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        invert: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps)

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
