import { BaseAnnotationTool } from './../base/index'
import * as vtkMath from 'vtk.js/Sources/Common/Core/Math'
// ~~ VTK Viewport
import { getEnabledElement, imageCache } from '../../../index'
import { getTargetVolume, getToolStateWithinSlice } from '../../util/planar'
import throttle from '../../util/throttle'
import { addToolState, getToolState } from '../../stateManagement/toolState'
import toolColors from '../../stateManagement/toolColors'
import toolStyle from '../../stateManagement/toolStyle'
import { getNewContext, setShadow } from '../../drawing'
import {
  clearByToolType,
  draw as drawSvg,
  drawHandles as drawHandlesSvg,
  drawLine as drawLineSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
} from '../../drawingSvg'
import { vec2 } from 'gl-matrix'
import { state } from '../../store'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import { getViewportUIDsWithToolToRender } from '../../util/viewportFilters'
import cornerstoneMath from 'cornerstone-math'
import { indexWithinDimensions } from '../../util/vtkjs'
import { getTextBoxCoordsCanvas } from '../../util/drawing'
import { showToolCursor, hideToolCursor } from '../../store/toolCursor'

class LengthTool extends BaseAnnotationTool {
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

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'Length',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
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

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStats,
      100,
      { trailing: true }
    )
  }

  addNewMeasurement(evt, interactionType) {
    const eventData = evt.detail
    const { currentPoints, element } = eventData
    const worldPos = currentPoints.world
    const enabledElement = getEnabledElement(element)
    const { viewport, FrameOfReferenceUID, renderingEngine } = enabledElement

    if (!FrameOfReferenceUID) {
      console.warn('No FrameOfReferenceUID, empty scene, exiting early.')

      return
    }

    hideToolCursor(element)

    const camera = viewport.getCamera()
    const { viewPlaneNormal, viewUp } = camera
    const toolData = {
      metadata: {
        viewPlaneNormal: [...viewPlaneNormal],
        viewUp: [...viewUp],
        FrameOfReferenceUID,
        toolName: this.name,
      },
      data: {
        invalidated: true,
        handles: {
          points: [[...worldPos], [...worldPos]],
          activeHandleIndex: null,
          textBox: {
            hasMoved: false,
            worldPosition: [0, 0, 0],
          },
        },
        cachedStats: {},
        active: true,
      },
    }

    addToolState(element, toolData)

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    )

    this.editData = {
      toolData,
      viewportUIDsToRender,
      handleIndex: 1,
      movingTextBox: false,
      newAnnotation: true,
      hasMoved: false,
    }
    this._activateDraw(element)

    evt.preventDefault()

    renderingEngine.renderViewports(viewportUIDsToRender)
  }

  getHandleNearImagePoint(element, toolData, canvasCoords, proximity) {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    const { data } = toolData
    const { points, textBox } = data.handles
    const { worldBoundingBox } = textBox

    if (worldBoundingBox) {
      const canvasBoundingBox = {
        topLeft: viewport.worldToCanvas(worldBoundingBox.topLeft),
        topRight: viewport.worldToCanvas(worldBoundingBox.topRight),
        bottomLeft: viewport.worldToCanvas(worldBoundingBox.bottomLeft),
        bottmRight: viewport.worldToCanvas(worldBoundingBox.bottomRight),
      }

      if (
        canvasCoords[0] >= canvasBoundingBox.topLeft[0] &&
        canvasCoords[0] <= canvasBoundingBox.bottmRight[0] &&
        canvasCoords[1] >= canvasBoundingBox.topLeft[1] &&
        canvasCoords[1] <= canvasBoundingBox.bottmRight[1]
      ) {
        data.handles.activeHandleIndex = null
        return textBox
      }
    }

    for (let i = 0; i < points.length; i++) {
      const point = points[i]
      const toolDataCanvasCoordinate = viewport.worldToCanvas(point)

      const near =
        vec2.distance(canvasCoords, toolDataCanvasCoordinate) < proximity

      if (near === true) {
        data.handles.activeHandleIndex = i
        return point
      }
    }

    data.handles.activeHandleIndex = null
  }

  pointNearTool(element, toolData, canvasCoords, proximity) {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement
    const { data } = toolData
    const [point1, point2] = data.handles.points
    const canavasPoint1 = viewport.worldToCanvas(point1)
    const canavasPoint2 = viewport.worldToCanvas(point2)

    const lineSegment = {
      start: {
        x: canavasPoint1[0],
        y: canavasPoint1[1],
      },
      end: {
        x: canavasPoint2[0],
        y: canavasPoint2[1],
      },
    }

    const distanceToPoint = cornerstoneMath.lineSegment.distanceToPoint(
      lineSegment,
      {
        x: canvasCoords[0],
        y: canvasCoords[1],
      }
    )

    if (distanceToPoint <= proximity) {
      return true
    }
  }

  toolSelectedCallback(evt, toolData, interactionType = 'mouse') {
    const eventData = evt.detail
    const { element } = eventData

    const { data } = toolData

    data.active = true

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    )

    this.editData = {
      toolData,
      viewportUIDsToRender,
      movingTextBox: false,
    }

    this._activateModify(element)

    hideToolCursor(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    renderingEngine.renderViewports(viewportUIDsToRender)

    evt.preventDefault()
  }

  handleSelectedCallback(evt, toolData, handle, interactionType = 'mouse') {
    const eventData = evt.detail
    const { element } = eventData
    const { data } = toolData

    data.active = true

    let movingTextBox = false
    let handleIndex

    if (handle.worldPosition) {
      movingTextBox = true
    } else {
      handleIndex = data.handles.points.findIndex((p) => p === handle)
    }

    // Find viewports to render on drag.
    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    )

    this.editData = {
      toolData,
      viewportUIDsToRender,
      handleIndex,
      movingTextBox,
    }
    this._activateModify(element)

    hideToolCursor(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    renderingEngine.renderViewports(viewportUIDsToRender)

    evt.preventDefault()
  }

  _mouseUpCallback(evt) {
    const eventData = evt.detail
    const { element } = eventData

    const {
      toolData,
      viewportUIDsToRender,
      newAnnotation,
      hasMoved,
    } = this.editData
    const { data } = toolData

    if (newAnnotation && !hasMoved) {
      return
    }

    data.active = false
    data.handles.activeHandleIndex = null

    this._deactivateModify(element)
    this._deactivateDraw(element)
    showToolCursor(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    renderingEngine.renderViewports(viewportUIDsToRender)

    this.editData = null
  }

  _mouseDragCallback(evt) {
    const eventData = evt.detail
    const { element } = eventData

    const {
      toolData,
      viewportUIDsToRender,
      handleIndex,
      movingTextBox,
    } = this.editData
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
    } else {
      // Moving handle
      const { currentPoints } = eventData
      const worldPos = currentPoints.world

      data.handles.points[handleIndex] = [...worldPos]
    }

    data.invalidated = true
    this.editData.hasMoved = true

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    renderingEngine.renderViewports(viewportUIDsToRender)
  }

  _activateModify(element) {
    state.isToolLocked = true

    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  _deactivateModify(element) {
    state.isToolLocked = false

    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.removeEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  _activateDraw(element) {
    state.isToolLocked = true

    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.addEventListener(EVENTS.MOUSE_MOVE, this._mouseDragCallback)
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  _deactivateDraw(element) {
    state.isToolLocked = false

    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.removeEventListener(EVENTS.MOUSE_MOVE, this._mouseDragCallback)
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.removeEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  /**
   * getToolState = Custom getToolStateMethod with filtering.
   * @param element
   */
  filterInteractableToolStateForElement(element, toolState) {
    if (!toolState || !toolState.length) {
      return
    }

    const enabledElement = getEnabledElement(element)
    const { viewport, scene } = enabledElement
    const camera = viewport.getCamera()

    const { spacingInNormalDirection } = getTargetVolume(scene, camera)

    // Get data with same normal
    const toolDataWithinSlice = getToolStateWithinSlice(
      toolState,
      camera,
      spacingInNormalDirection
    )

    return toolDataWithinSlice
  }

  renderToolData(evt: CustomEvent): void {
    const eventData = evt.detail
    const { canvas: canvasElement } = eventData
    let toolState = getToolState(canvasElement, this.name)

    if (!toolState) {
      clearByToolType(canvasElement, this.name)
      return
    }

    toolState = this.filterInteractableToolStateForElement(
      canvasElement,
      toolState
    )

    if (!toolState.length) {
      clearByToolType(canvasElement, this.name)
      return
    }

    const enabledElement = getEnabledElement(canvasElement)
    const { viewport, scene } = enabledElement
    const targetVolumeUID = this._getTargetVolumeUID(scene)

    const context = getNewContext(canvasElement)
    const lineWidth = toolStyle.getToolWidth()

    // ~~ SVG
    // Note: Loop happens inside draw (which does annotation cleanup)

    // Draw SVG
    drawSvg(canvasElement, this.name, (svgDrawingHelper) => {
      for (let i = 0; i < toolState.length; i++) {
        const toolData = toolState[i]
        const annotationUID = toolData.metadata.toolUID
        const data = toolData.data
        const color = toolColors.getColorIfActive(data)
        const { points, activeHandleIndex } = data.handles
        const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))
        const handleGroupUID = '0'

        drawHandlesSvg(
          svgDrawingHelper,
          this.name,
          annotationUID,
          handleGroupUID,
          canvasCoordinates,
          {
            color,
          }
        )

        const lineUID = '1'
        drawLineSvg(
          svgDrawingHelper,
          this.name,
          annotationUID,
          lineUID,
          canvasCoordinates[0],
          canvasCoordinates[1],
          {
            color,
          }
        )

        // WE HAVE TO CACHE STATS BEFORE FETCHING TEXT
        if (!data.cachedStats[targetVolumeUID]) {
          data.cachedStats[targetVolumeUID] = {}

          const { viewPlaneNormal } = viewport.getCamera()
          this._calculateCachedStats(data, viewPlaneNormal)
        } else if (data.invalidated) {
          const { viewPlaneNormal } = viewport.getCamera()
          this._throttledCalculateCachedStats(data, viewPlaneNormal)
        }

        const textLines = this._getTextLines(data, targetVolumeUID)

        // Need to update to sync w/ annotation while unlinked/not moved
        if (!data.handles.textBox.hasMoved) {
          const canvasTextBoxCoords = getTextBoxCoordsCanvas(canvasCoordinates)

          data.handles.textBox.worldPosition = viewport.canvasToWorld(
            canvasTextBoxCoords
          )
        }

        const textBoxPosition = viewport.worldToCanvas(
          data.handles.textBox.worldPosition
        )

        const textBoxUID = '1'
        drawLinkedTextBoxSvg(
          svgDrawingHelper,
          this.name,
          annotationUID,
          textBoxUID,
          textLines,
          textBoxPosition,
          canvasCoordinates,
          {},
          {
            color,
          }
        )
      }
    })
  }

  _findTextBoxAnchorPoints(points) {
    return [
      points[0],
      points[1],
      [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2],
    ]
  }

  _getTextLines(data, targetVolumeUID) {
    const cachedVolumeStats = data.cachedStats[targetVolumeUID]
    const { length } = cachedVolumeStats

    if (length === undefined) {
      return
    }

    // spaceBetweenSlices & pixelSpacing &
    // magnitude in each direction? Otherwise, this is "px"?
    const textLines = [`${length.toFixed(2)} mm`]

    return textLines
  }

  _calculateCachedStats(data, viewPlaneNormal) {
    const worldPos1 = data.handles.points[0]
    const worldPos2 = data.handles.points[1]
    const { cachedStats } = data
    const volumeUIDs = Object.keys(cachedStats)

    // TODO clean up, this doesn't need a length per volume, it has no stats derived from volumes.

    for (let i = 0; i < volumeUIDs.length; i++) {
      const volumeUID = volumeUIDs[i]
      const { metadata } = imageCache.getImageVolume(volumeUID)

      const length = Math.sqrt(
        vtkMath.distance2BetweenPoints(worldPos1, worldPos2)
      )

      // TODO -> Do we instead want to clip to the bounds of the volume and only include that portion?
      // Seems like a lot of work for an unrealistic case. At the moment bail out of stat calculation if either
      // corner is off the canvas.

      cachedStats[volumeUID] = {
        Modality: metadata.Modality,
        length,
      }
    }

    data.invalidated = false

    return cachedStats
  }

  _isInsideVolume(index1, index2, dimensions) {
    return (
      indexWithinDimensions(index1, dimensions) &&
      indexWithinDimensions(index2, dimensions)
    )
  }

  _clipIndexToVolume(index, dimensions) {
    for (let i = 0; i <= 2; i++) {
      if (index[i] < 0) {
        index[i] = 0
      } else if (index[i] >= dimensions[i]) {
        index[i] = dimensions[i] - 1
      }
    }
  }

  _getTargetVolumeUID(scene) {
    if (this.configuration.volumeUID) {
      return this.configuration.volumeUID
    }

    const volumeActors = scene.getVolumeActors()

    if (!volumeActors && !volumeActors.length) {
      // No stack to scroll through
      return
    }

    return volumeActors[0].uid
  }
}

export default LengthTool
