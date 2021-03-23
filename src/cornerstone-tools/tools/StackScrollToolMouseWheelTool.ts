import { BaseTool } from './base/index'
import { scrollThroughStack } from '../util/stackScrollTool'

export default class StackScrollMouseWheelTool extends BaseTool {
  _configuration: any

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'StackScrollMouseWheel',
      supportedInteractionTypes: ['Mouse', 'Touch'],
    })
  }

  mouseWheelCallback(evt) {
    const { wheel } = evt.detail
    const { direction: deltaFrames } = wheel

    const { volumeUID } = this.configuration
    scrollThroughStack(evt, deltaFrames, volumeUID)
  }
}
