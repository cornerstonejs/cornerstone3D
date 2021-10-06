import { vec2 } from 'gl-matrix'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import {
  getEnabledElement,
  VIEWPORT_TYPE,
  getVolume,
  StackViewport,
  Settings,
  triggerEvent,
  eventTarget,
  Types,
} from '@ohif/cornerstone-render'

import { getToolStateForDisplay, getImageIdForTool } from '../../util/planar'
import { BaseAnnotationTool } from '../base'
import throttle from '../../util/throttle'
import {
  addToolState,
  getToolState,
  removeToolState,
} from '../../stateManagement/toolState'
import { isToolDataLocked } from '../../stateManagement/toolDataLocking'
import { lineSegment } from '../../util/math'

import {
  drawHandles as drawHandlesSvg,
  drawLine as drawLineSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
} from '../../drawingSvg'
import { state } from '../../store'
import { getViewportUIDsWithToolToRender } from '../../util/viewportFilters'
import { indexWithinDimensions } from '../../util/vtkjs'
import { getTextBoxCoordsCanvas } from '../../util/drawing'
import triggerAnnotationRenderForViewportUIDs from '../../util/triggerAnnotationRenderForViewportUIDs'

import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor'

import { ToolSpecificToolData, Point3 } from '../../types'
import BaseBrushTool from '../base/BaseBrushTool'

// interface LengthSpecificToolData extends ToolSpecificToolData {
//   data: {
//     invalidated: boolean
//     handles: {
//       points: Point3[]
//       activeHandleIndex: number | null
//       textBox: {
//         hasMoved: boolean
//         worldPosition: Point3
//         worldBoundingBox: {
//           topLeft: Point3
//           topRight: Point3
//           bottomLeft: Point3
//           bottomRight: Point3
//         }
//       }
//     }
//     cachedStats: any
//     active: boolean
//   }
// }

class BrushTool extends BaseBrushTool {
  public touchDragCallback: any
  public mouseDragCallback: any
  _throttledCalculateCachedStats: any
  editData: {
    toolData: any
    viewportUIDsToRender: string[]
    handleIndex?: number
    movingTextBox?: boolean
    newAnnotation?: boolean
    hasMoved?: boolean
  } | null
  _configuration: any
  isDrawing: boolean
  isHandleOutsideImage: boolean

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'Brush',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
      },
    })

    /**
     * Will only fire fore cornerstone events:
     * - TOUCH_DRAG
     * - MOUSE_DRAG
     *
     * Given that the tool is active and has matching bindings for the
     * underlying touch/mouse event.
     */
    this._activateModify = this._activateModify.bind(this)
    this._deactivateModify = this._deactivateModify.bind(this)
    this._mouseUpCallback = this._mouseUpCallback.bind(this)
    this._mouseDragCallback = this._mouseDragCallback.bind(this)
  }

  addPaint(evt: CustomEvent) {
    const eventData = evt.detail
    const { currentPoints, element } = eventData
    const worldPos = currentPoints.world
    const enabledElement = getEnabledElement(element)
    const { viewport, renderingEngine } = enabledElement

    hideElementCursor(element)
    this.isDrawing = true

    const camera = viewport.getCamera()
    const { viewPlaneNormal, viewUp } = camera

    // let referencedImageId
    // if (viewport instanceof StackViewport) {
    //   referencedImageId =
    //     viewport.getCurrentImageId && viewport.getCurrentImageId()
    // } else {
    //   const { volumeUID } = this.configuration
    //   const imageVolume = getVolume(volumeUID)
    //   referencedImageId = getImageIdForTool(
    //     worldPos,
    //     viewPlaneNormal,
    //     viewUp,
    //     imageVolume
    //   )
    // }

    // if (referencedImageId) {
    //   const colonIndex = referencedImageId.indexOf(':')
    //   referencedImageId = referencedImageId.substring(colonIndex + 1)
    // }

    // const toolData = {
    //   metadata: {
    //     viewPlaneNormal: <Point3>[...viewPlaneNormal],
    //     viewUp: <Point3>[...viewUp],
    //     FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
    //     referencedImageId,
    //     toolName: this.name,
    //   },
    //   data: {
    //     invalidated: true,
    //     handles: {
    //       points: [<Point3>[...worldPos], <Point3>[...worldPos]],
    //       activeHandleIndex: null,
    //       textBox: {
    //         hasMoved: false,
    //         worldPosition: <Point3>[0, 0, 0],
    //         worldBoundingBox: {
    //           topLeft: <Point3>[0, 0, 0],
    //           topRight: <Point3>[0, 0, 0],
    //           bottomLeft: <Point3>[0, 0, 0],
    //           bottomRight: <Point3>[0, 0, 0],
    //         },
    //       },
    //     },
    //     cachedStats: {},
    //     active: true,
    //   },
    // }

    // Ensure settings are initialized after tool data instantiation
    // Settings.getObjectSettings(toolData, LengthTool)

    // addToolState(element, toolData)

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    )

    this.editData = {
      toolData: {},
      viewportUIDsToRender,
      // handleIndex: 1,
      // movingTextBox: false,
      newAnnotation: true,
      // hasMoved: false,
    }
    this._activateDraw(element)

    evt.preventDefault()

    // triggerAnnotationRenderForViewportUIDs(
    //   renderingEngine,
    //   viewportUIDsToRender
    // )

    return true
  }

  _mouseUpCallback(evt) {
    console.debug('mouse up')

    const eventData = evt.detail
    const { element } = eventData

    const { toolData, viewportUIDsToRender, newAnnotation, hasMoved } =
      this.editData
    const { data } = toolData

    if (newAnnotation && !hasMoved) {
      // when user starts the drawing by click, and moving the mouse, instead
      // of click and drag
      return
    }

    data.active = false
    data.handles.activeHandleIndex = null

    this._deactivateModify(element)
    this._deactivateDraw(element)
    resetElementCursor(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    if (
      this.isHandleOutsideImage &&
      this.configuration.preventHandleOutsideImage
    ) {
      removeToolState(element, toolData)
    }

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    this.editData = null
    this.isDrawing = false
  }

  _mouseDragCallback(evt) {
    this.isDrawing = true
    console.debug('mouse drag')
    const eventData = evt.detail
    const { element } = eventData

    const { toolData, viewportUIDsToRender, handleIndex, movingTextBox } =
      this.editData
    const { data } = toolData

    if (movingTextBox) {
      const { deltaPoints } = eventData
      const worldPosDelta = deltaPoints.world

      const { textBox } = data.handles
      const { worldPosition } = textBox

      worldPosition[0] += worldPosDelta[0]
      worldPosition[1] += worldPosDelta[1]
      worldPosition[2] += worldPosDelta[2]

      textBox.hasMoved = true
    } else if (handleIndex === undefined) {
      // Moving tool
      const { deltaPoints } = eventData
      const worldPosDelta = deltaPoints.world

      const points = data.handles.points

      points.forEach((point) => {
        point[0] += worldPosDelta[0]
        point[1] += worldPosDelta[1]
        point[2] += worldPosDelta[2]
      })
      data.invalidated = true
    } else {
      // Moving handle
      const { currentPoints } = eventData
      const worldPos = currentPoints.world

      data.handles.points[handleIndex] = [...worldPos]
      data.invalidated = true
    }

    this.editData.hasMoved = true

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )
  }

  _activateModify(element) {
    state.isInteractingWithTool = true

    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  _deactivateModify(element) {
    state.isInteractingWithTool = false

    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.removeEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  _activateDraw(element) {
    state.isInteractingWithTool = true

    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.addEventListener(EVENTS.MOUSE_MOVE, this._mouseDragCallback)
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  _deactivateDraw(element) {
    state.isInteractingWithTool = false

    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.removeEventListener(EVENTS.MOUSE_MOVE, this._mouseDragCallback)
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.removeEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  _paint(paintData) {
    const { canvas, labelmap, viewportUID, sceneUID, currentPoints } = paintData
    debugger
  }
}

export default BrushTool
