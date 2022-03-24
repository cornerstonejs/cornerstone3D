import { BaseTool } from './base'
import { scrollThroughStack } from '../utilities/stackScrollTool'
import { MouseWheelEventType } from '../types/EventTypes'

/**
 * The StackScrollMouseWheelTool is a tool that allows the user to scroll through a
 * stack of images using the mouse wheel
 */
export default class StackScrollMouseWheelTool extends BaseTool {
  static toolName = 'StackScrollMouseWheel'

  _configuration: any

  constructor(
    toolProps = {},
    defaultToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      invert: false,
    }
  ) {
    super(toolProps, defaultToolProps)
  }

  mouseWheelCallback(evt: MouseWheelEventType): void {
    const { wheel } = evt.detail
    const { direction: deltaFrames } = wheel
    const { invert, volumeId } = this.configuration
    scrollThroughStack(evt, deltaFrames, volumeId, invert)
  }
}
