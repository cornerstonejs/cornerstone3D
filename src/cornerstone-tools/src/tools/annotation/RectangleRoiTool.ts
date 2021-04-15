import { BaseAnnotationTool } from '../base'
import Point2 from 'src/cornerstone-core/src/types/Point2'
// ~~ VTK Viewport
import { getEnabledElement, getVolume } from '@cornerstone'
import { getTargetVolume, getToolStateWithinSlice } from '../../util/planar'
import throttle from '../../util/throttle'
import { addToolState, getToolState } from '../../stateManagement/toolState'
import toolColors from '../../stateManagement/toolColors'
import toolStyle from '../../stateManagement/toolStyle'
import {
  drawHandles as drawHandlesSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
  drawRect as drawRectSvg,
} from '../../drawingSvg'
import { vec2 } from 'gl-matrix'
import { state } from '../../store'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import { getViewportUIDsWithToolToRender } from '../../util/viewportFilters'
import cornerstoneMath from 'cornerstone-math'
import { getTextBoxCoordsCanvas } from '../../util/drawing'
import getWorldWidthAndHeightInPlane from '../../util/planar/getWorldWidthAndHeightInPlane'
import { indexWithinDimensions } from '../../util/vtkjs'
import { showToolCursor, hideToolCursor } from '../../store/toolCursor'

export default class RectangleRoiTool extends BaseAnnotationTool {
  _throttledCalculateCachedStats: any
  editData: {
    toolData: any
    viewportUIDsToRender: string[]
    handleIndex?: number
    movingTextBox: boolean
    newAnnotation?: boolean
    hasMoved?: boolean
  } | null
  _configuration: any

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'RectangleRoi',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: { shadow: true },
    })

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStats,
      100,
      { trailing: true }
    )
  }

  addNewMeasurement = (evt, interactionType) => {
    const eventData = evt.detail
    const { currentPoints, element } = eventData
    const worldPos = currentPoints.world

    const enabledElement = getEnabledElement(element)
    const { viewport, FrameOfReferenceUID, renderingEngine } = enabledElement

    if (!FrameOfReferenceUID) {
      console.warn('No FrameOfReferenceUID, empty scene, exiting early.')

      return
    }

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
          points: [[...worldPos], [...worldPos], [...worldPos], [...worldPos]],
          textBox: {
            hasMoved: false,
            worldPosition: [0, 0, 0],
          },
          activeHandleIndex: null,
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
      handleIndex: 3,
      movingTextBox: false,
      newAnnotation: true,
      hasMoved: false,
    }
    this._activateDraw(element)

    hideToolCursor(element)

    evt.preventDefault()

    renderingEngine.renderViewports(viewportUIDsToRender)
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

    const distanceToPoint = cornerstoneMath.rect.distanceToPoint(rect, {
      x: canvasCoords[0],
      y: canvasCoords[1],
    })

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

    hideToolCursor(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    renderingEngine.renderViewports(viewportUIDsToRender)

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

    hideToolCursor(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    renderingEngine.renderViewports(viewportUIDsToRender)

    evt.preventDefault()
  }

  _mouseUpCallback = (evt) => {
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

  _mouseDragCallback = (evt) => {
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
    }

    data.invalidated = true
    this.editData.hasMoved = true

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    renderingEngine.renderViewports(viewportUIDsToRender)
  }

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _activateDraw = (element) => {
    state.isToolLocked = true

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
    state.isToolLocked = false

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
    state.isToolLocked = true

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
    state.isToolLocked = false

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

  renderToolData(evt: CustomEvent, svgDrawingHelper: any): void {
    const eventData = evt.detail
    const { canvas: canvasElement } = eventData

    let toolState = getToolState(svgDrawingHelper.enabledElement, this.name)

    if (!toolState) {
      return
    }

    toolState = this.filterInteractableToolStateForElement(
      canvasElement,
      toolState
    )

    if (!toolState.length) {
      return
    }

    const { viewport, scene } = svgDrawingHelper.enabledElement
    const targetVolumeUID = this._getTargetVolumeUID(scene)
    const lineWidth = toolStyle.getToolWidth()

    for (let i = 0; i < toolState.length; i++) {
      const toolData = toolState[i]
      const annotationUID = toolData.metadata.toolUID
      const data = toolData.data
      const color = toolColors.getColorIfActive(data)
      const { points, activeHandleIndex } = data.handles
      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))

      if (!data.cachedStats[targetVolumeUID]) {
        // This volume has not had its stats calulcated yet, so recalculate the stats.
        data.cachedStats[targetVolumeUID] = {}

        const { viewPlaneNormal, viewUp } = viewport.getCamera()
        this._calculateCachedStats(data, viewPlaneNormal, viewUp)
      } else if (data.invalidated) {
        // The data has been invalidated as it was just edited. Recalculate cached stats.
        const { viewPlaneNormal, viewUp } = viewport.getCamera()
        this._throttledCalculateCachedStats(data, viewPlaneNormal, viewUp)
      }

      let activeHandleCanvasCoords

      if (!this.editData && activeHandleIndex !== null) {
        // Not creating and hovering over handle, so render handle.

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
        { color }
      )

      const textLines = this._getTextLines(data, targetVolumeUID)
      if (!textLines || textLines.length === 0) {
        continue
      }

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
      const boundingBox = drawLinkedTextBoxSvg(
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
    const { left, top, width, height } = this._getRectangleImageCoordinates(
      points
    )

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
   * @param {string} targetVolumeUID - The volumeUID of the volume to display the stats for.
   */
  _getTextLines = (data, targetVolumeUID: string) => {
    const cachedVolumeStats = data.cachedStats[targetVolumeUID]
    const { area, mean, stdDev, Modality } = cachedVolumeStats

    if (mean === undefined) {
      return
    }

    const textLines = []

    const areaLine = `Area: ${area.toFixed(2)} mm${String.fromCharCode(178)}`
    let meanLine = `Mean: ${mean.toFixed(2)}`
    let stdDevLine = `Std Dev: ${stdDev.toFixed(2)}`

    // Give appropriate units for the modality.
    if (Modality === 'PT') {
      meanLine += ' SUV'
      stdDevLine += ' SUV'
    } else if (Modality === 'CT') {
      meanLine += ' HU'
      stdDevLine += ' HU'
    } else {
      meanLine += ' MO'
      stdDevLine += ' MO'
    }

    textLines.push(areaLine)
    textLines.push(meanLine)
    textLines.push(stdDevLine)

    return textLines
  }

  /**
   * _calculateCachedStats - For each volume in the frame of reference that a
   * tool instance in particular viewport defines as its target volume, find the
   * volume coordinates (i,j,k) being probed by the two corners. One of i,j or k
   * will be constant across the two points. In the other two directions iterate
   * over the voxels and calculate the first and second-order statistics.
   *
   * @param {object} data - The toolDatas tool-specific data.
   * @param {Array<number>} viewPlaneNormal The normal vector of the camera.
   * @param {Array<number>} viewUp The viewUp vector of the camera.
   */
  _calculateCachedStats = (data, viewPlaneNormal, viewUp) => {
    const worldPos1 = data.handles.points[0]
    const worldPos2 = data.handles.points[3]
    const { cachedStats } = data

    const volumeUIDs = Object.keys(cachedStats)

    for (let i = 0; i < volumeUIDs.length; i++) {
      const volumeUID = volumeUIDs[i]
      const imageVolume = getVolume(volumeUID)

      const {
        dimensions,
        scalarData,
        vtkImageData: imageData,
        metadata,
      } = imageVolume
      const worldPos1Index = [0, 0, 0]
      const worldPos2Index = [0, 0, 0]

      imageData.worldToIndexVec3(worldPos1, worldPos1Index)

      worldPos1Index[0] = Math.floor(worldPos1Index[0])
      worldPos1Index[1] = Math.floor(worldPos1Index[1])
      worldPos1Index[2] = Math.floor(worldPos1Index[2])

      imageData.worldToIndexVec3(worldPos2, worldPos2Index)

      worldPos2Index[0] = Math.floor(worldPos2Index[0])
      worldPos2Index[1] = Math.floor(worldPos2Index[1])
      worldPos2Index[2] = Math.floor(worldPos2Index[2])

      // Check if one of the indexes are inside the volume, this then gives us
      // Some area to do stats over.

      if (this._isInsideVolume(worldPos1Index, worldPos2Index, dimensions)) {
        // Calculate index bounds to itterate over

        const iMin = Math.min(worldPos1Index[0], worldPos2Index[0])
        const iMax = Math.max(worldPos1Index[0], worldPos2Index[0])

        const jMin = Math.min(worldPos1Index[1], worldPos2Index[1])
        const jMax = Math.max(worldPos1Index[1], worldPos2Index[1])

        const kMin = Math.min(worldPos1Index[2], worldPos2Index[2])
        const kMax = Math.max(worldPos1Index[2], worldPos2Index[2])

        const { worldWidth, worldHeight } = getWorldWidthAndHeightInPlane(
          viewPlaneNormal,
          viewUp,
          imageVolume,
          worldPos1,
          worldPos2
        )

        const area = worldWidth * worldHeight

        let count = 0
        let mean = 0
        let stdDev = 0

        const yMultiple = dimensions[0]
        const zMultiple = dimensions[0] * dimensions[1]

        // This is a tripple loop, but one of these 3 values will be constant
        // In the planar view.
        for (let k = kMin; k <= kMax; k++) {
          for (let j = jMin; j <= jMax; j++) {
            for (let i = iMin; i <= iMax; i++) {
              const value = scalarData[k * zMultiple + j * yMultiple + i]

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

        cachedStats[volumeUID] = {
          Modality: metadata.Modality,
          area,
          mean,
          stdDev,
        }
      } else {
        cachedStats[volumeUID] = {
          Modality: metadata.Modality,
        }
      }
    }

    data.invalidated = false

    return cachedStats
  }

  _isInsideVolume = (index1, index2, dimensions) => {
    return (
      indexWithinDimensions(index1, dimensions) &&
      indexWithinDimensions(index2, dimensions)
    )
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
