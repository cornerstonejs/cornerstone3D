import { getEnabledElementByUIDs } from '@precisionmetrics/cornerstone-render'
import { BaseTool } from './base'
import { scrollThroughStack } from '../utilities/stackScrollTool'
import { PublicToolProps, ToolProps, EventTypes } from '../types'

/**
 * The StackScrollTool is a tool that allows the user to scroll through a
 * stack of images by pressing the mouse click and dragging
 */
export default class StackScrollTool extends BaseTool {
  static toolName = 'StackScroll'
  touchDragCallback: () => void
  mouseDragCallback: () => void

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
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

  _dragCallback(evt: EventTypes.MouseDragEventType) {
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
