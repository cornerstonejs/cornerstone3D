import vtkMath from 'vtk.js/Sources/Common/Core/Math'
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
import { showToolCursor, hideToolCursor } from '../../store/toolCursor'

import { ToolSpecificToolData, Point3, Point2 } from '../../types'

interface LengthSpecificToolData extends ToolSpecificToolData {
  data: {
    invalidated: boolean
    handles: {
      points: Point3[]
      activeHandleIndex: number | null
      textBox: {
        hasMoved: boolean
        worldPosition: Point3
        worldBoundingBox: {
          topLeft: Point3
          topRight: Point3
          bottomLeft: Point3
          bottomRight: Point3
        }
      }
    }
    cachedStats: any
    active: boolean
  }
}

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
  isDrawing: boolean
  isHandleOutsideImage: boolean

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'Length',
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

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStats,
      100,
      { trailing: true }
    )
  }

  addNewMeasurement(evt: CustomEvent): LengthSpecificToolData {
    const eventData = evt.detail
    const { currentPoints, element } = eventData
    const worldPos = currentPoints.world
    const enabledElement = getEnabledElement(element)
    const { viewport, renderingEngine } = enabledElement

    hideToolCursor(element)
    this.isDrawing = true

    const camera = viewport.getCamera()
    const { viewPlaneNormal, viewUp } = camera

    // TODO: what do we do here? this feels wrong
    let referencedImageId
    if (viewport instanceof StackViewport) {
      referencedImageId =
        viewport.getCurrentImageId && viewport.getCurrentImageId()
    } else {
      const { volumeUID } = this.configuration
      const imageVolume = getVolume(volumeUID)
      referencedImageId = getImageIdForTool(
        worldPos,
        viewPlaneNormal,
        viewUp,
        imageVolume
      )
    }

    if (referencedImageId) {
      const colonIndex = referencedImageId.indexOf(':')
      referencedImageId = referencedImageId.substring(colonIndex + 1)
    }

    const toolData = {
      metadata: {
        viewPlaneNormal: <Point3>[...viewPlaneNormal],
        viewUp: <Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
        toolName: this.name,
      },
      data: {
        invalidated: true,
        handles: {
          points: [<Point3>[...worldPos], <Point3>[...worldPos]],
          activeHandleIndex: null,
          textBox: {
            hasMoved: false,
            worldPosition: <Point3>[0, 0, 0],
            worldBoundingBox: {
              topLeft: <Point3>[0, 0, 0],
              topRight: <Point3>[0, 0, 0],
              bottomLeft: <Point3>[0, 0, 0],
              bottomRight: <Point3>[0, 0, 0],
            },
          },
        },
        cachedStats: {},
        active: true,
      },
    }

    // Ensure settings are initialized after tool data instantiation
    Settings.getObjectSettings(toolData, LengthTool)

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

    return toolData
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
        bottomRight: viewport.worldToCanvas(worldBoundingBox.bottomRight),
      }

      if (
        canvasCoords[0] >= canvasBoundingBox.topLeft[0] &&
        canvasCoords[0] <= canvasBoundingBox.bottomRight[0] &&
        canvasCoords[1] >= canvasBoundingBox.topLeft[1] &&
        canvasCoords[1] <= canvasBoundingBox.bottomRight[1]
      ) {
        data.handles.activeHandleIndex = null
        return textBox
      }
    }

    for (let i = 0; i < points.length; i++) {
      const point = points[i]
      const toolDataCanvasCoordinate = viewport.worldToCanvas(point)

      const near =
        vec2.distance(canvasCoords, <vec2>toolDataCanvasCoordinate) < proximity

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
    const canvasPoint1 = viewport.worldToCanvas(point1)
    const canvasPoint2 = viewport.worldToCanvas(point2)

    const line = {
      start: {
        x: canvasPoint1[0],
        y: canvasPoint1[1],
      },
      end: {
        x: canvasPoint2[0],
        y: canvasPoint2[1],
      },
    }

    const distanceToPoint = lineSegment.distanceToPoint(
      [line.start.x, line.start.y],
      [line.end.x, line.end.y],
      [canvasCoords[0], canvasCoords[1]]
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
    showToolCursor(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    if (
      this.isHandleOutsideImage &&
      this.configuration.preventHandleOutsideImage
    ) {
      removeToolState(element, toolData)
    }

    renderingEngine.renderViewports(viewportUIDsToRender)

    this.editData = null
    this.isDrawing = false
  }

  _mouseDragCallback(evt) {
    this.isDrawing = true
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

  cancel(element) {
    // If it is mid-draw or mid-modify
    if (this.isDrawing) {
      this.isDrawing = false
      this._deactivateDraw(element)
      this._deactivateModify(element)
      showToolCursor(element)

      const { toolData, viewportUIDsToRender } = this.editData
      const { data } = toolData

      data.active = false
      data.handles.activeHandleIndex = null

      const enabledElement = getEnabledElement(element)
      const { renderingEngine } = enabledElement

      renderingEngine.renderViewports(viewportUIDsToRender)

      this.editData = null
      return toolData.metadata.toolUID
    }
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
   * @param toolState
   */
  filterInteractableToolStateForElement(element, toolState) {
    if (!toolState || !toolState.length) {
      return
    }

    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    return getToolStateForDisplay(viewport, toolState)
  }

  renderToolData(evt: CustomEvent, svgDrawingHelper: any): void {
    const eventData = evt.detail
    const { canvas: canvasElement } = eventData
    const { enabledElement } = svgDrawingHelper

    let toolState = getToolState(enabledElement, this.name)

    if (!toolState?.length) {
      return
    }

    toolState = this.filterInteractableToolStateForElement(
      canvasElement,
      toolState
    )

    if (!toolState?.length) {
      return
    }

    const { viewport } = enabledElement
    let targetUID
    if (viewport.type === VIEWPORT_TYPE.STACK) {
      targetUID = this._getTargetStackUID(viewport)
    } else if (viewport.type === VIEWPORT_TYPE.ORTHOGRAPHIC) {
      const scene = viewport.getScene()
      targetUID = this._getTargetVolumeUID(scene)
    } else {
      throw new Error(`Viewport Type not supported: ${viewport.type}`)
    }

    const renderingEngine = viewport.getRenderingEngine()

    // Draw SVG
    for (let i = 0; i < toolState.length; i++) {
      const toolData = toolState[i] as LengthSpecificToolData
      const settings = Settings.getObjectSettings(toolData, LengthTool)
      const annotationUID = toolData.metadata.toolUID
      const data = toolData.data
      const { points, activeHandleIndex } = data.handles
      const lineWidth = this.getStyle(settings, 'lineWidth', toolData)
      const lineDash = this.getStyle(settings, 'lineDash', toolData)
      const color = this.getStyle(settings, 'color', toolData)

      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))

      let activeHandleCanvasCoords

      if (
        !isToolDataLocked(toolData) &&
        !this.editData &&
        activeHandleIndex !== null
      ) {
        // Not locked or creating and hovering over handle, so render handle.
        activeHandleCanvasCoords = [canvasCoordinates[activeHandleIndex]]
      }

      if (activeHandleCanvasCoords) {
        const handleGroupUID = '0'

        drawHandlesSvg(
          svgDrawingHelper,
          this.name,
          annotationUID,
          handleGroupUID,
          canvasCoordinates,
          {
            color,
            lineDash,
            lineWidth,
          }
        )
      }

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
          width: lineWidth,
        }
      )

      // WE HAVE TO CACHE STATS BEFORE FETCHING TEXT
      if (!data.cachedStats[targetUID]) {
        data.cachedStats[targetUID] = {}

        this._calculateCachedStats(toolData, renderingEngine, enabledElement)
      } else if (data.invalidated) {
        this._throttledCalculateCachedStats(
          toolData,
          renderingEngine,
          enabledElement
        )
      }

      const textLines = this._getTextLines(data, targetUID)

      // Need to update to sync w/ annotation while unlinked/not moved
      if (!data.handles.textBox.hasMoved) {
        const canvasTextBoxCoords = getTextBoxCoordsCanvas(canvasCoordinates)

        data.handles.textBox.worldPosition =
          viewport.canvasToWorld(canvasTextBoxCoords)
      }

      const textBoxPosition = viewport.worldToCanvas(
        data.handles.textBox.worldPosition
      )

      const textBoxUID = '1'
      const boundingBox = drawLinkedTextBoxSvg(
        svgDrawingHelper,
        this.name,
        annotationUID,
        textBoxUID,
        textLines,
        textBoxPosition,
        canvasCoordinates,
        {},
        this.getLinkedTextBoxStyle(settings, toolData)
      )

      const { x: left, y: top, width, height } = boundingBox

      data.handles.textBox.worldBoundingBox = {
        topLeft: viewport.canvasToWorld([left, top]),
        topRight: viewport.canvasToWorld([left + width, top]),
        bottomLeft: viewport.canvasToWorld([left, top + height]),
        bottomRight: viewport.canvasToWorld([left + width, top + height]),
      }
    }
  }

  _findTextBoxAnchorPoints(points) {
    return [
      points[0],
      points[1],
      [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2],
    ]
  }

  // text line for the current active length measurement
  _getTextLines(data, targetUID) {
    const cachedVolumeStats = data.cachedStats[targetUID]
    const { length } = cachedVolumeStats

    if (length === undefined) {
      return
    }

    // spaceBetweenSlices & pixelSpacing &
    // magnitude in each direction? Otherwise, this is "px"?
    const textLines = [`${length.toFixed(2)} mm`]

    return textLines
  }

  _getImageVolumeFromTargetUID(targetUID, renderingEngine) {
    let imageVolume, viewport
    if (targetUID.startsWith('stackTarget')) {
      const coloneIndex = targetUID.indexOf(':')
      const viewportUID = targetUID.substring(coloneIndex + 1)
      viewport = renderingEngine.getViewport(viewportUID)
      imageVolume = viewport.getImageData()
    } else {
      imageVolume = getVolume(targetUID)
    }

    return { imageVolume, viewport }
  }

  _calculateCachedStats(toolData, renderingEngine, enabledElement) {
    const data = toolData.data
    const { viewportUID, renderingEngineUID, sceneUID } = enabledElement

    const worldPos1 = data.handles.points[0]
    const worldPos2 = data.handles.points[1]
    const { cachedStats } = data
    const targetUIDs = Object.keys(cachedStats)

    // TODO clean up, this doesn't need a length per volume, it has no stats derived from volumes.

    for (let i = 0; i < targetUIDs.length; i++) {
      const targetUID = targetUIDs[i]

      const { imageVolume } = this._getImageVolumeFromTargetUID(
        targetUID,
        renderingEngine
      )

      const { vtkImageData: imageData, dimensions } = imageVolume

      const length = Math.sqrt(
        vtkMath.distance2BetweenPoints(worldPos1, worldPos2)
      )

      const index1 = <Types.Point3>[0, 0, 0]
      const index2 = <Types.Point3>[0, 0, 0]

      imageData.worldToIndexVec3(worldPos1, index1)
      imageData.worldToIndexVec3(worldPos2, index2)

      this._isInsideVolume(index1, index2, dimensions)
        ? (this.isHandleOutsideImage = false)
        : (this.isHandleOutsideImage = true)

      // TODO -> Do we instead want to clip to the bounds of the volume and only include that portion?
      // Seems like a lot of work for an unrealistic case. At the moment bail out of stat calculation if either
      // corner is off the canvas.

      // todo: add insideVolume calculation, for removing tool if outside
      cachedStats[targetUID] = {
        length,
      }
    }

    data.invalidated = false

    // Dispatching measurement modified
    const eventType = EVENTS.MEASUREMENT_MODIFIED

    const eventDetail = {
      toolData,
      viewportUID,
      renderingEngineUID,
      sceneUID,
    }
    triggerEvent(eventTarget, eventType, eventDetail)

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

  _getTargetStackUID(viewport) {
    return `stackTarget:${viewport.uid}`
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
