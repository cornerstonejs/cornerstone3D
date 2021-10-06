import { BaseAnnotationTool } from '../base'
// ~~ VTK Viewport
import { vec3 } from 'gl-matrix'
import {
  getEnabledElement,
  getVolume,
  Settings,
  StackViewport,
  VolumeViewport,
  metaData,
  triggerEvent,
  eventTarget,
  cache,
} from '@ohif/cornerstone-render'
import { getImageIdForTool, getToolStateForDisplay } from '../../util/planar'
import throttle from '../../util/throttle'
import {
  addToolState,
  getToolState,
  removeToolState,
  toolDataSelection,
} from '../../stateManagement'
import { isToolDataLocked } from '../../stateManagement/toolDataLocking'

import {
  drawHandles as drawHandlesSvg,
  drawRect as drawRectSvg,
} from '../../drawingSvg'
import { vec2 } from 'gl-matrix'
import { state } from '../../store'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import { getViewportUIDsWithToolToRender } from '../../util/viewportFilters'
import rectangle from '../../util/math/rectangle'
import { indexWithinDimensions } from '../../util/vtkjs'
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor'
import triggerAnnotationRenderForViewportUIDs from '../../util/triggerAnnotationRenderForViewportUIDs'

import { ToolSpecificToolData, Point2, Point3 } from '../../types'
import thresholdVolume from './strategies/thresholdVolume'

import {
  setActiveLabelmapIndex,
  getActiveLabelmapIndex,
  getActiveSegmentIndex,
  getColorForSegmentIndexColorLUT,
  getSegmentsLockedForElement,
  getNextLabelmapIndex,
} from '../../store/SegmentationModule'

interface RectangleRoiThresholdToolData extends ToolSpecificToolData {
  data: {
    invalidated: boolean
    handles: {
      points: Point3[]
      activeHandleIndex: number | null
    }
    labelmapUID: string
    active: boolean
  }
}

export default class RectangleRoiThresholdTool extends BaseAnnotationTool {
  _throttledCalculateCachedStats: any
  editData: {
    toolData: any
    viewportUIDsToRender: string[]
    handleIndex?: number
    newAnnotation?: boolean
    hasMoved?: boolean
  } | null
  _configuration: any
  isDrawing: boolean
  isHandleOutsideImage: boolean

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'RectangleRoiThreshold',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: { shadow: true, preventHandleOutsideImage: false },
      strategies: {
        THRESHOLD_VOLUME: thresholdVolume,
      },
      defaultStrategy: 'THRESHOLD_VOLUME',
    })
  }

  addNewMeasurement = (evt: CustomEvent): RectangleRoiThresholdToolData => {
    const eventData = evt.detail
    const { currentPoints, element } = eventData
    const worldPos = currentPoints.world

    const enabledElement = getEnabledElement(element)
    const { viewport, renderingEngine } = enabledElement

    this.isDrawing = true

    const camera = viewport.getCamera()
    const { viewPlaneNormal, viewUp } = camera

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

    // Todo: how not to store enabledElement on the toolData, segmentationModule needs the element to
    // decide on the active segmentIndex, active labelmapIndex etc.
    const toolData = {
      metadata: {
        viewPlaneNormal: <Point3>[...viewPlaneNormal],
        enabledElement,
        viewUp: <Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
        toolName: this.name,
      },
      data: {
        invalidated: true,
        handles: {
          points: [
            <Point3>[...worldPos],
            <Point3>[...worldPos],
            <Point3>[...worldPos],
            <Point3>[...worldPos],
          ],
          activeHandleIndex: null,
        },
        labelmapUID: null,
        active: true,
      },
    }

    // Ensure settings are initialized after tool data instantiation
    Settings.getObjectSettings(toolData, RectangleRoiThresholdTool)

    addToolState(element, toolData)

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    )

    this.editData = {
      toolData,
      viewportUIDsToRender,
      handleIndex: 3,
      newAnnotation: true,
      hasMoved: false,
    }
    this._activateDraw(element)

    hideElementCursor(element)

    evt.preventDefault()

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    return toolData
  }

  getHandleNearImagePoint = (element, toolData, canvasCoords, proximity) => {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    const { data } = toolData
    const { points } = data.handles

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

  pointNearTool = (element, toolData, canvasCoords, proximity) => {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    const { data } = toolData
    const { points } = data.handles

    const canvasPoint1 = viewport.worldToCanvas(points[0])
    const canvasPoint2 = viewport.worldToCanvas(points[3])

    const rect = this._getRectangleImageCoordinates([
      canvasPoint1,
      canvasPoint2,
    ])

    const point = [canvasCoords[0], canvasCoords[1]]
    const { left, top, width, height } = rect

    const distanceToPoint = rectangle.distanceToPoint(
      [left, top, width, height],
      point
    )

    if (distanceToPoint <= proximity) {
      return true
    }
  }

  /**
   * Executes the active strategy on the selected annotation
   * @param options LowerThreshold and HigherThreshold values
   * @returns
   */
  public execute(options: [number, number]) {
    const selectedToolState = toolDataSelection.getSelectedToolDataByToolName(
      this.name
    )

    if (selectedToolState.length !== 1) {
      console.warn('Annotation should be selected to execute a strategy')
      return
    }

    const toolData = selectedToolState[0] as RectangleRoiThresholdToolData
    const { viewUp, viewPlaneNormal, enabledElement } = toolData.metadata
    const { labelmapUID } = toolData.data
    const { viewport, renderingEngine } = enabledElement
    const { canvas: element } = viewport

    const labelmap = cache.getVolume(labelmapUID)

    const segmentIndex = getActiveSegmentIndex(element)
    const segmentColor = getColorForSegmentIndexColorLUT(
      element,
      labelmapUID,
      segmentIndex
    )
    const segmentsLocked = getSegmentsLockedForElement(element)

    const eventDetail = {
      canvas: element,
      enabledElement,
      renderingEngine,
    }

    const operationData = {
      points: toolData.data.handles.points,
      options,
      volumeUIDs: [this.configuration.volumeUID],
      labelmap,
      segmentIndex,
      segmentColor,
      segmentsLocked,
      viewPlaneNormal,
      viewUp,
    }

    return this.applyActiveStrategy(eventDetail, operationData)
  }

  toolSelectedCallback = (evt, toolData, interactionType = 'mouse') => {
    console.debug('getting called buddy')
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
    }

    this._activateModify(element)

    hideElementCursor(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    evt.preventDefault()
  }

  handleSelectedCallback = (
    evt,
    toolData,
    handle,
    interactionType = 'mouse'
  ) => {
    console.debug('getting called buddy 888888888888')

    const eventData = evt.detail
    const { element } = eventData
    const { data } = toolData

    data.active = true

    let handleIndex

    if (!handle.worldPosition) {
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
    }
    this._activateModify(element)

    hideElementCursor(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    evt.preventDefault()
  }

  _mouseUpCallback = async (evt) => {
    const eventData = evt.detail
    const { element } = eventData

    const { toolData, viewportUIDsToRender, newAnnotation, hasMoved } =
      this.editData
    const { data } = toolData

    if (newAnnotation && !hasMoved) {
      return
    }

    data.active = false
    data.handles.activeHandleIndex = null

    this._deactivateModify(element)
    this._deactivateDraw(element)

    resetElementCursor(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    this.editData = null
    this.isDrawing = false

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    // If already created the labelmap for this toolData return
    if (!toolData.data.labelmapUID) {
      // Otherwise Create Labelmap for the new rectangle measurement
      const labelmapIndex = getNextLabelmapIndex(element)
      const labelmapUID = await setActiveLabelmapIndex(element, labelmapIndex)

      toolData.data.labelmapUID = labelmapUID
    }
  }

  _mouseDragCallback = (evt) => {
    this.isDrawing = true

    const eventData = evt.detail
    const { element } = eventData

    const { toolData, viewportUIDsToRender, handleIndex } = this.editData
    const { data } = toolData

    if (handleIndex === undefined) {
      // Moving tool, so move all points by the world points delta
      const { deltaPoints } = eventData
      const worldPosDelta = deltaPoints.world

      const { points } = data.handles

      points.forEach((point) => {
        point[0] += worldPosDelta[0]
        point[1] += worldPosDelta[1]
        point[2] += worldPosDelta[2]
      })
      data.invalidated = true
    } else {
      // Moving handle.
      const { currentPoints } = eventData
      const enabledElement = getEnabledElement(element)
      const { worldToCanvas, canvasToWorld } = enabledElement.viewport
      const worldPos = currentPoints.world

      const { points } = data.handles

      // Move this handle.
      points[handleIndex] = [...worldPos]

      let bottomLeftCanvas
      let bottomRightCanvas
      let topLeftCanvas
      let topRightCanvas

      let bottomLeftWorld
      let bottomRightWorld
      let topLeftWorld
      let topRightWorld

      switch (handleIndex) {
        case 0:
        case 3:
          // Moving bottomLeft or topRight

          bottomLeftCanvas = worldToCanvas(points[0])
          topRightCanvas = worldToCanvas(points[3])

          bottomRightCanvas = [topRightCanvas[0], bottomLeftCanvas[1]]
          topLeftCanvas = [bottomLeftCanvas[0], topRightCanvas[1]]

          bottomRightWorld = canvasToWorld(bottomRightCanvas)
          topLeftWorld = canvasToWorld(topLeftCanvas)

          points[1] = bottomRightWorld
          points[2] = topLeftWorld

          break
        case 1:
        case 2:
          // Moving bottomRight or topLeft
          bottomRightCanvas = worldToCanvas(points[1])
          topLeftCanvas = worldToCanvas(points[2])

          bottomLeftCanvas = <Point2>[topLeftCanvas[0], bottomRightCanvas[1]]
          topRightCanvas = <Point2>[bottomRightCanvas[0], topLeftCanvas[1]]

          bottomLeftWorld = canvasToWorld(bottomLeftCanvas)
          topRightWorld = canvasToWorld(topRightCanvas)

          points[0] = bottomLeftWorld
          points[3] = topRightWorld

          break
      }
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

  cancel(element) {
    // If it is mid-draw or mid-modify
    if (this.isDrawing) {
      this.isDrawing = false
      this._deactivateDraw(element)
      this._deactivateModify(element)
      resetElementCursor(element)

      const { toolData, viewportUIDsToRender } = this.editData

      const { data } = toolData

      data.active = false
      data.handles.activeHandleIndex = null

      const enabledElement = getEnabledElement(element)
      const { renderingEngine } = enabledElement

      triggerAnnotationRenderForViewportUIDs(
        renderingEngine,
        viewportUIDsToRender
      )

      this.editData = null
      return toolData.metadata.toolDataUID
    }
  }
  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _activateDraw = (element) => {
    state.isInteractingWithTool = true

    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.addEventListener(EVENTS.MOUSE_MOVE, this._mouseDragCallback)
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _deactivateDraw = (element) => {
    state.isInteractingWithTool = false

    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.removeEventListener(EVENTS.MOUSE_MOVE, this._mouseDragCallback)
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.removeEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _activateModify = (element) => {
    state.isInteractingWithTool = true

    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  /**
   * Remove event handlers for the modify event loop, and enable default event propagation.
   */
  _deactivateModify = (element) => {
    state.isInteractingWithTool = false

    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.removeEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  /**
   * getToolState = Custom getToolStateMethod with filtering.
   * @param element
   * @param toolState
   */
  filterInteractableToolStateForElement = (element, toolState) => {
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
    let toolState = getToolState(svgDrawingHelper.enabledElement, this.name)

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
    if (viewport instanceof StackViewport) {
      targetUID = this._getTargetStackUID(viewport)
    } else if (viewport instanceof VolumeViewport) {
      const scene = viewport.getScene()
      targetUID = this._getTargetVolumeUID(scene)
    } else {
      throw new Error(`Viewport Type not supported: ${viewport.type}`)
    }

    const renderingEngine = viewport.getRenderingEngine()

    for (let i = 0; i < toolState.length; i++) {
      const toolData = toolState[i] as RectangleRoiThresholdToolData
      const settings = Settings.getObjectSettings(
        toolData,
        RectangleRoiThresholdTool
      )
      const toolMetadata = toolData.metadata
      const annotationUID = toolMetadata.toolDataUID

      const data = toolData.data
      const { points, activeHandleIndex } = data.handles
      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))
      const lineWidth = this.getStyle(settings, 'lineWidth', toolData)
      const lineDash = this.getStyle(settings, 'lineDash', toolData)
      const color = this.getStyle(settings, 'color', toolData)

      const { viewPlaneNormal, viewUp } = viewport.getCamera()

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed')
        return
      }

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
          activeHandleCanvasCoords,
          {
            color,
          }
        )
      }

      const rectangleUID = '0'
      drawRectSvg(
        svgDrawingHelper,
        this.name,
        annotationUID,
        rectangleUID,
        canvasCoordinates[0],
        canvasCoordinates[3],
        {
          color,
          lineDash,
          lineWidth,
        }
      )
    }
  }

  _getRectangleImageCoordinates = (
    points: Array<Point2>
  ): {
    left: number
    top: number
    width: number
    height: number
  } => {
    const [point0, point1] = points

    return {
      left: Math.min(point0[0], point1[0]),
      top: Math.min(point0[1], point1[1]),
      width: Math.abs(point0[0] - point1[0]),
      height: Math.abs(point0[1] - point1[1]),
    }
  }

  _getImageVolumeFromTargetUID(targetUID, renderingEngine) {
    let imageVolume, viewport
    if (targetUID.startsWith('stackTarget')) {
      const coloneIndex = targetUID.indexOf(':')
      const viewportUID = targetUID.substring(coloneIndex + 1)
      const viewport = renderingEngine.getViewport(viewportUID)
      imageVolume = viewport.getImageData()
    } else {
      imageVolume = getVolume(targetUID)
    }

    return { imageVolume, viewport }
  }

  _isInsideVolume = (index1, index2, dimensions) => {
    return (
      indexWithinDimensions(index1, dimensions) &&
      indexWithinDimensions(index2, dimensions)
    )
  }

  _getTargetStackUID(viewport) {
    return `stackTarget:${viewport.uid}`
  }

  _getTargetVolumeUID = (scene) => {
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
