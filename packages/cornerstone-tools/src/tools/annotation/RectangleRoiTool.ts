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
} from '@precisionmetrics/cornerstone-render'
import { getImageIdForTool, getToolStateForDisplay } from '../../util/planar'
import throttle from '../../util/throttle'
import {
  addToolState,
  getToolState,
  removeToolState,
} from '../../stateManagement'
import { isToolDataLocked } from '../../stateManagement/annotation/toolDataLocking'

import {
  drawHandles as drawHandlesSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
  drawRect as drawRectSvg,
} from '../../drawingSvg'
import { vec2 } from 'gl-matrix'
import { state } from '../../store'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import { getViewportUIDsWithToolToRender } from '../../util/viewportFilters'
import rectangle from '../../util/math/rectangle'
import { getTextBoxCoordsCanvas } from '../../util/drawing'
import getWorldWidthAndHeightFromCorners from '../../util/planar/getWorldWidthAndHeightFromCorners'
import { indexWithinDimensions } from '../../util/vtkjs'
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor'
import triggerAnnotationRenderForViewportUIDs from '../../util/triggerAnnotationRenderForViewportUIDs'

import { ToolSpecificToolData, Point2, Point3 } from '../../types'

export interface RectangleRoiSpecificToolData extends ToolSpecificToolData {
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
    cachedStats?: any
    active: boolean
  }
}

export default class RectangleRoiTool extends BaseAnnotationTool {
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

  constructor(
    toolConfiguration: Record<string, any>,
    defaultToolConfiguration = {
      name: 'RectangleRoi',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
      },
    }
  ) {
    super(toolConfiguration, defaultToolConfiguration)

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStats,
      100,
      { trailing: true }
    )
  }

  addNewMeasurement = (evt: CustomEvent): RectangleRoiSpecificToolData => {
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
      const volumeUID = this.getTargetUID(viewport)
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
        label: '',
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
          activeHandleIndex: null,
        },
        cachedStats: {},
        active: true,
      },
    }

    // Ensure settings are initialized after tool data instantiation
    Settings.getObjectSettings(toolData, RectangleRoiTool)

    addToolState(element, toolData)

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    )

    this.editData = {
      toolData,
      viewportUIDsToRender,
      handleIndex: 3,
      movingTextBox: false,
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
    const { points, textBox } = data.handles
    const { worldBoundingBox } = textBox

    if (worldBoundingBox) {
      // If the bounding box for the textbox exists, see if we are clicking within it.
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

  toolSelectedCallback = (evt, toolData, interactionType = 'mouse') => {
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

    hideElementCursor(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )

    evt.preventDefault()
  }

  _mouseUpCallback = (evt) => {
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
  }

  _mouseDragCallback = (evt) => {
    this.isDrawing = true

    const eventData = evt.detail
    const { element } = eventData

    const { toolData, viewportUIDsToRender, handleIndex, movingTextBox } =
      this.editData
    const { data } = toolData

    if (movingTextBox) {
      // Move the text boxes world position
      const { deltaPoints } = eventData
      const worldPosDelta = deltaPoints.world

      const { textBox } = data.handles
      const { worldPosition } = textBox

      worldPosition[0] += worldPosDelta[0]
      worldPosition[1] += worldPosDelta[1]
      worldPosition[2] += worldPosDelta[2]

      textBox.hasMoved = true
    } else if (handleIndex === undefined) {
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
    const { element } = eventData

    const { enabledElement } = svgDrawingHelper
    let toolState = getToolState(svgDrawingHelper.enabledElement, this.name)

    if (!toolState?.length) {
      return
    }

    toolState = this.filterInteractableToolStateForElement(element, toolState)

    if (!toolState?.length) {
      return
    }

    const { viewport } = enabledElement
    const targetUID = this.getTargetUID(viewport)

    const renderingEngine = viewport.getRenderingEngine()

    for (let i = 0; i < toolState.length; i++) {
      const toolData = toolState[i] as RectangleRoiSpecificToolData
      const settings = Settings.getObjectSettings(toolData, RectangleRoiTool)
      const toolMetadata = toolData.metadata
      const annotationUID = toolMetadata.toolDataUID

      const data = toolData.data
      const { points, activeHandleIndex } = data.handles
      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))
      const lineWidth = this.getStyle(settings, 'lineWidth', toolData)
      const lineDash = this.getStyle(settings, 'lineDash', toolData)
      const color = this.getStyle(settings, 'color', toolData)

      const { viewPlaneNormal, viewUp } = viewport.getCamera()

      if (!data.cachedStats[targetUID]) {
        data.cachedStats[targetUID] = {}
        this._calculateCachedStats(
          toolData,
          viewPlaneNormal,
          viewUp,
          renderingEngine,
          enabledElement
        )
      } else if (data.invalidated) {
        this._throttledCalculateCachedStats(
          toolData,
          viewPlaneNormal,
          viewUp,
          renderingEngine,
          enabledElement
        )

        // If the invalidated data is as a result of volumeViewport manipulation
        // of the tools, we need to invalidate the related stackViewports data if
        // they are not at the referencedImageId, so that
        // when scrolling to the related slice in which the tool were manipulated
        // we re-render the correct tool position. This is due to stackViewport
        // which doesn't have the full volume at each time, and we are only working
        // on one slice at a time.
        if (viewport instanceof VolumeViewport) {
          const { referencedImageId } = toolData.metadata

          // todo: this is not efficient, but necessary
          // invalidate all the relevant stackViewports if they are not
          // at the referencedImageId
          const viewports = renderingEngine.getViewports()
          viewports.forEach((vp) => {
            const stackTargetUID = this.getTargetUID(vp)
            // only delete the cachedStats for the stackedViewports if the tool
            // is dragged inside the volume and the stackViewports are not at the
            // referencedImageId for the tool
            if (
              vp instanceof StackViewport &&
              !vp.getCurrentImageId().includes(referencedImageId) &&
              data.cachedStats[stackTargetUID]
            ) {
              delete data.cachedStats[stackTargetUID]
            }
          })
        }
      }

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

      const textLines = this._getTextLines(data, targetUID)
      if (!textLines || textLines.length === 0) {
        continue
      }

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

  /**
   * _findTextBoxAnchorPoints - Finds the middle points of each rectangle side
   * to attach the linked textbox to.
   *
   * @param {} points - An array of points.
   */
  _findTextBoxAnchorPoints = (points: Array<Point2>): Array<Point2> => {
    const { left, top, width, height } =
      this._getRectangleImageCoordinates(points)

    return [
      [
        // Top middle point of rectangle
        left + width / 2,
        top,
      ],
      [
        // Left middle point of rectangle
        left,
        top + height / 2,
      ],
      [
        // Bottom middle point of rectangle
        left + width / 2,
        top + height,
      ],
      [
        // Right middle point of rectangle
        left + width,
        top + height / 2,
      ],
    ]
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

  /**
   * _getTextLines - Returns the Area, mean and std deviation of the area of the
   * target volume enclosed by the rectangle.
   *
   * @param {object} data - The toolDatas tool-specific data.
   * @param {string} targetUID - The volumeUID of the volume to display the stats for.
   */
  _getTextLines = (data, targetUID: string) => {
    const cachedVolumeStats = data.cachedStats[targetUID]
    const { area, mean, max, stdDev, Modality } = cachedVolumeStats

    if (mean === undefined) {
      return
    }

    const textLines = []

    const areaLine = `Area: ${area.toFixed(2)} mm${String.fromCharCode(178)}`
    let meanLine = `Mean: ${mean.toFixed(2)}`
    let maxLine = `Max: ${max.toFixed(2)}`
    let stdDevLine = `Std Dev: ${stdDev.toFixed(2)}`

    // Give appropriate units for the modality.
    if (Modality === 'PT') {
      meanLine += ' SUV'
      maxLine += ' SUV'
      stdDevLine += ' SUV'
    } else if (Modality === 'CT') {
      meanLine += ' HU'
      maxLine += ' HU'
      stdDevLine += ' HU'
    } else {
      meanLine += ' MO'
      maxLine += ' MO'
      stdDevLine += ' MO'
    }

    textLines.push(areaLine)
    textLines.push(maxLine)
    textLines.push(meanLine)
    textLines.push(stdDevLine)

    return textLines
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

  /**
   * _calculateCachedStats - For each volume in the frame of reference that a
   * tool instance in particular viewport defines as its target volume, find the
   * volume coordinates (i,j,k) being probed by the two corners. One of i,j or k
   * will be constant across the two points. In the other two directions iterate
   * over the voxels and calculate the first and second-order statistics.
   *
   * @param {object} data - The toolData tool-specific data.
   * @param {Array<number>} viewPlaneNormal The normal vector of the camera.
   * @param {Array<number>} viewUp The viewUp vector of the camera.
   */
  _calculateCachedStats = (
    toolData,
    viewPlaneNormal,
    viewUp,
    renderingEngine,
    enabledElement
  ) => {
    const { data } = toolData
    const { viewportUID, renderingEngineUID } = enabledElement

    const worldPos1 = data.handles.points[0]
    const worldPos2 = data.handles.points[3]
    const { cachedStats } = data

    const targetUIDs = Object.keys(cachedStats)

    for (let i = 0; i < targetUIDs.length; i++) {
      const targetUID = targetUIDs[i]

      const { imageVolume } = this._getImageVolumeFromTargetUID(
        targetUID,
        renderingEngine
      )

      const { dimensions, scalarData, imageData, metadata } = imageVolume

      const worldPos1Index = imageData.worldToIndex(worldPos1)

      worldPos1Index[0] = Math.floor(worldPos1Index[0])
      worldPos1Index[1] = Math.floor(worldPos1Index[1])
      worldPos1Index[2] = Math.floor(worldPos1Index[2])

      const worldPos2Index = imageData.worldToIndex(worldPos2)

      worldPos2Index[0] = Math.floor(worldPos2Index[0])
      worldPos2Index[1] = Math.floor(worldPos2Index[1])
      worldPos2Index[2] = Math.floor(worldPos2Index[2])

      // Check if one of the indexes are inside the volume, this then gives us
      // Some area to do stats over.

      if (this._isInsideVolume(worldPos1Index, worldPos2Index, dimensions)) {
        this.isHandleOutsideImage = false

        // Calculate index bounds to iterate over

        const iMin = Math.min(worldPos1Index[0], worldPos2Index[0])
        const iMax = Math.max(worldPos1Index[0], worldPos2Index[0])

        const jMin = Math.min(worldPos1Index[1], worldPos2Index[1])
        const jMax = Math.max(worldPos1Index[1], worldPos2Index[1])

        const kMin = Math.min(worldPos1Index[2], worldPos2Index[2])
        const kMax = Math.max(worldPos1Index[2], worldPos2Index[2])

        const { worldWidth, worldHeight } = getWorldWidthAndHeightFromCorners(
          viewPlaneNormal,
          viewUp,
          worldPos1,
          worldPos2
        )

        const area = worldWidth * worldHeight

        let count = 0
        let mean = 0
        let stdDev = 0
        let max = -Infinity

        const yMultiple = dimensions[0]
        const zMultiple = dimensions[0] * dimensions[1]

        //Todo: this can be replaced by pointInShapeCallback....
        // This is a triple loop, but one of these 3 values will be constant
        // In the planar view.
        for (let k = kMin; k <= kMax; k++) {
          for (let j = jMin; j <= jMax; j++) {
            for (let i = iMin; i <= iMax; i++) {
              const value = scalarData[k * zMultiple + j * yMultiple + i]

              if (value > max) {
                max = value
              }

              count++
              mean += value
            }
          }
        }

        mean /= count

        for (let k = kMin; k <= kMax; k++) {
          for (let j = jMin; j <= jMax; j++) {
            for (let i = iMin; i <= iMax; i++) {
              const value = scalarData[k * zMultiple + j * yMultiple + i]

              const valueMinusMean = value - mean

              stdDev += valueMinusMean * valueMinusMean
            }
          }
        }

        stdDev /= count
        stdDev = Math.sqrt(stdDev)

        cachedStats[targetUID] = {
          Modality: metadata.Modality,
          area,
          mean,
          stdDev,
          max,
        }
      } else {
        this.isHandleOutsideImage = true
        cachedStats[targetUID] = {
          Modality: metadata.Modality,
        }
      }
    }

    data.invalidated = false

    // Dispatching measurement modified
    const eventType = EVENTS.MEASUREMENT_MODIFIED

    const eventDetail = {
      toolData,
      viewportUID,
      renderingEngineUID,
    }
    triggerEvent(eventTarget, eventType, eventDetail)

    return cachedStats
  }

  _isInsideVolume = (index1, index2, dimensions) => {
    return (
      indexWithinDimensions(index1, dimensions) &&
      indexWithinDimensions(index2, dimensions)
    )
  }
}
