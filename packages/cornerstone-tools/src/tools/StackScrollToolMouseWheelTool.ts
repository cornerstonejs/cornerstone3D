import { BaseTool } from './base'
import { scrollThroughStack } from '../utilities/stackScrollTool'

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

  mouseWheelCallback(evt) {
    const { wheel } = evt.detail
    const { direction: deltaFrames } = wheel
    const { invert, volumeUID } = this.configuration
    scrollThroughStack(evt, deltaFrames, volumeUID, invert)
  }
}
