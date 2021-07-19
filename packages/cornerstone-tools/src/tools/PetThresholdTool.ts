import {
  getEnabledElement,
  EVENTS,
  triggerEvent,
  eventTarget,
  VolumeViewport,
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

    const { uid: volumeUID } = viewport.getDefaultActor()

    let volumeActor

    if (viewport instanceof VolumeViewport && volumeUID) {
      volumeActor = scene.getVolumeActor(volumeUID)
    } else {
      const volumeActors = viewport.getActors()
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

    const newRange = { lower, upper }

    rgbTransferFunction.setMappingRange(lower, upper)

    const eventDetail = {
      volumeUID,
      viewportUID,
      sceneUID,
      range: { lower, upper },
    }

    triggerEvent(canvas, EVENTS.VOI_MODIFIED, eventDetail)

    if (scene || viewport instanceof VolumeViewport) {
      scene.render()
      return
    }

    // store the new range for viewport to preserve it during scrolling
    viewport.setProperties({
      voi: newRange
    })

    viewport.render()
  }
}
