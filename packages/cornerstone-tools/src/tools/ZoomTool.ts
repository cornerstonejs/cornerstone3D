import { BaseTool } from './base'
// ~~ VTK Viewport
import { getEnabledElement } from '@ohif/cornerstone-render'

export default class ZoomTool extends BaseTool {
  touchDragCallback: () => void
  mouseDragCallback: () => void

  // Apparently TS says super _must_ be the first call? This seems a bit opinionated.
  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'Zoom',
      supportedInteractionTypes: ['Mouse', 'Touch'],
    })

    /**
     * Will only fire two cornerstone events:
     * - TOUCH_DRAG
     * - MOUSE_DRAG
     *
     * Given that the tool is active and has matching bindings for the
     * underlying touch/mouse event.
     */
    this.touchDragCallback = this._dragCallback.bind(this)
    this.mouseDragCallback = this._dragCallback.bind(this)
  }

  // Takes ICornerstoneEvent, Mouse or Touch
  _dragCallback(evt) {
    const { element } = evt.detail
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    const camera = viewport.getCamera()

    if (camera.parallelProjection) {
      this._dragParallelProjection(evt, camera)
    } else {
      this._dragPerspectiveProjection(evt, camera)
    }

    viewport.render()
  }

  _dragParallelProjection = (evt, camera) => {
    const { element, deltaPoints } = evt.detail
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement
    const size = [element.clientWidth, element.clientHeight]

    const zoomScale = 1.5 / size[1]

    const deltaY = deltaPoints.canvas[1]

    const k = deltaY * zoomScale

    const newParallelScale = (1.0 - k) * camera.parallelScale

    // viewport.setCamera({ parallelScale: newParallelScale, deltaPoints });
    viewport.setCamera({ parallelScale: newParallelScale })
  }

  _dragPerspectiveProjection = (evt, camera) => {
    const { element, deltaPoints } = evt.detail
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement
    const size = [element.clientWidth, element.clientHeight]

    const range = camera.clippingRange
    const zoomScale = 1.5 * (range[1] / size[1])

    const { position, focalPoint, viewPlaneNormal } = camera

    const directionOfProjection = [
      -viewPlaneNormal[0],
      -viewPlaneNormal[1],
      -viewPlaneNormal[2],
    ]

    const deltaY = deltaPoints.canvas[1]

    const k = deltaY * zoomScale

    let tmp = k * directionOfProjection[0]
    position[0] += tmp
    focalPoint[0] += tmp

    tmp = k * directionOfProjection[1]
    position[1] += tmp
    focalPoint[1] += tmp

    tmp = k * directionOfProjection[2]
    position[2] += tmp
    focalPoint[2] += tmp

    viewport.setCamera({ position, focalPoint })
  }
}
