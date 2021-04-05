import { BaseTool } from './base/index'
import { Point3 } from './../types'
import { getEnabledElement } from '@cornerstone'

/**
 * @class PanTool
 * @classdesc Tool that pans the camera in the plane defined by the sliceNormal and the viewUp.
 *
 * @export
 * @class PanTool
 * @extends {BaseTool}
 */
export default class PanTool extends BaseTool {
  touchDragCallback: () => void
  mouseDragCallback: () => void

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'Pan',
      supportedInteractionTypes: ['Mouse', 'Touch'],
    })

    this.touchDragCallback = this._dragCallback.bind(this)
    this.mouseDragCallback = this._dragCallback.bind(this)
  }

  _dragCallback(evt) {
    const { element: canvas, deltaPoints } = evt.detail
    const enabledElement = getEnabledElement(canvas)

    const deltaPointsWorld = deltaPoints.world
    const camera = enabledElement.viewport.getCamera()
    const { focalPoint, position } = camera

    const updatedPosition = <Point3>[
      position[0] - deltaPointsWorld[0],
      position[1] - deltaPointsWorld[1],
      position[2] - deltaPointsWorld[2],
    ]

    const updatedFocalPoint = <Point3>[
      focalPoint[0] - deltaPointsWorld[0],
      focalPoint[1] - deltaPointsWorld[1],
      focalPoint[2] - deltaPointsWorld[2],
    ]

    enabledElement.viewport.setCamera({
      focalPoint: updatedFocalPoint,
      position: updatedPosition,
    })
    enabledElement.viewport.render()
  }
}
