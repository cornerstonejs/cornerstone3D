import {
  getEnabledElement,
  EVENTS,
  triggerEvent,
  eventTarget,
} from '@cornerstone'
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
    const { scene, sceneUID } = enabledElement

    const { volumeUID } = this.configuration

    let volumeActor

    if (volumeUID) {
      volumeActor = scene.getVolumeActor(volumeUID)

      if (!volumeActor) {
        // Intentional use of volumeUID which is not defined, so throw.
        throw new Error(
          `Scene does not have a volume actor with specified volumeUID: ${volumeUID}`
        )
      }
    } else {
      // Default to first volumeActor
      const volumeActors = scene.getVolumeActors()

      if (volumeActors && volumeActors.length) {
        volumeActor = volumeActors[0].volumeActor
      }
    }

    if (!volumeActor) {
      // No volume actor available.
      return
    }

    const rgbTransferFunction = volumeActor
      .getProperty()
      .getRGBTransferFunction(0)

    const deltaY = deltaPoints.canvas[1]
    const multiplier = 5 / canvas.clientHeight
    const wcDelta = deltaY * multiplier
    const range = rgbTransferFunction.getRange()
    const lower = range[0]
    let upper = range[1]

    upper -= wcDelta
    upper = Math.max(upper, 0.1)

    rgbTransferFunction.setMappingRange(lower, upper)

    const eventDetail = {
      volumeUID,
      sceneUID,
      range: { lower, upper },
    }

    triggerEvent(canvas, EVENTS.VOI_MODIFIED, eventDetail)

    scene.render()
  }
}
