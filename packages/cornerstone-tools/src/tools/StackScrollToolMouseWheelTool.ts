import { BaseTool } from './base'
import { scrollThroughStack } from '../util/stackScrollTool'

export default class StackScrollMouseWheelTool extends BaseTool {
  _configuration: any

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'StackScrollMouseWheel',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      invert: false,
    })
  }

  mouseWheelCallback(evt) {
    const { wheel } = evt.detail
    const { direction: deltaFrames } = wheel

    const { volumeUID, invert } = this.configuration
    scrollThroughStack(evt, deltaFrames, volumeUID, invert)
  }
}
