import {
  getEnabledElement,
  EVENTS,
  triggerEvent,
  VolumeViewport,
  StackViewport,
} from '@ohif/cornerstone-render'
import { BaseTool } from './base'

export default class PetThresholdTool extends BaseTool {
  touchDragCallback: () => void
  mouseDragCallback: () => void
  _configuration: any

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'PetThreshold',
      supportedInteractionTypes: ['Mouse', 'Touch'],
    })

    this.touchDragCallback = this._dragCallback.bind(this)
    this.mouseDragCallback = this._dragCallback.bind(this)
  }

  _dragCallback(evt) {
    const { element: canvas, deltaPoints } = evt.detail
    const enabledElement = getEnabledElement(canvas)
    const { scene, sceneUID, viewportUID, viewport } = enabledElement

    let volumeUID, volumeActor, lower, upper, rgbTransferFunction

    if (viewport instanceof VolumeViewport) {
      volumeUID = this.configuration.volumeUID
      volumeActor = scene.getVolumeActor(volumeUID)
      rgbTransferFunction = volumeActor.getProperty().getRGBTransferFunction(0)
      ;[lower, upper] = rgbTransferFunction.getRange()
    } else {
      const properties = viewport.getProperties()
      ;({ lower, upper } = properties.voiRange)
    }

    const deltaY = deltaPoints.canvas[1]
    const multiplier = 5 / canvas.clientHeight
    const wcDelta = deltaY * multiplier

    upper -= wcDelta
    upper = Math.max(upper, 0.1)

    const newRange = { lower, upper }

    const eventDetail = {
      volumeUID,
      viewportUID,
      sceneUID,
      range: { lower, upper },
    }

    triggerEvent(canvas, EVENTS.VOI_MODIFIED, eventDetail)

    if (viewport instanceof StackViewport) {
      viewport.setProperties({
        voiRange: newRange,
      })

      viewport.render()
      return
    }

    rgbTransferFunction.setRange(newRange.lower, newRange.upper)
    scene.render()
  }
}
