import { vec2 } from 'gl-matrix'
import cloneDeep from 'lodash.clonedeep'

import {
  Settings,
  getEnabledElement,
  getVolume,
  StackViewport,
} from '@precisionmetrics/cornerstone-render'
import { CornerstoneTools3DEvents as EVENTS } from '../../../enums'
import { Point3, Point2 } from '../../../types'
import { drawCircle as drawCircleSvg } from '../../../drawingSvg'
import {
  resetElementCursor,
  hideElementCursor,
} from '../../../cursors/elementCursor'
import { state } from '../../../store'

import { isToolDataLocked } from '../../../stateManagement/toolDataLocking'
import {
  pointInEllipse,
  getCanvasEllipseCorners,
} from '../../../util/math/ellipse'
import { getViewportUIDsWithToolToRender } from '../../../util/viewportFilters'

import { getTextBoxCoordsCanvas } from '../../../util/drawing'
import {
  drawLinkedTextBox as drawLinkedTextBoxSvg,
  drawHandles as drawHandlesSvg,
} from '../../../drawingSvg'
import triggerAnnotationRenderForViewportUIDs from '../../../util/triggerAnnotationRenderForViewportUIDs'
import { getToolStateForDisplay } from '../../../util/planar'

import { addToolState, getToolState } from '../../../stateManagement/toolState'
import suvPeakStrategy from './suvPeakStrategy'
import EllipticalRoiTool, {
  EllipticalRoiSpecificToolData,
} from '../EllipticalRoiTool'

interface SUVPeakSpecificToolData extends EllipticalRoiSpecificToolData {
  data: {
    invalidated: boolean
    handles: {
      center: {
        world: Point3
        canvas: Point3
      }
      points: [Point3, Point3, Point3, Point3] // [bottom, top, left, right]
      activeHandleIndex: number | null
    }
    isDrawing: boolean
    cachedStats: any
    active: boolean
  }
  // If the annotation is handling multiple data types. For instance, in SUVPetPeak
  // each annotation contains two circles toolData. The first one is the initial drawn
  // and the second one is the result of computation on the first one.
  secondaryData: {
    handles: {
      points: [Point3, Point3, Point3, Point3] // [bottom, top, left, right]
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
    cachedStats: {
      suvPeakValue: number
      suvMax: number
    }
  }
}

/**
 * SUV Peak tool allows the user to draw a SUV peak annotation. The tool is
 * composed of three steps: 1) drawing the initial circle (which will get propagated
 * as a sphere annotation) 2) Finding the maximum SUV value in the sphere 3) Drawing
 * a 1cc sphere centered around the SUVMax point and calculating the mean SUV value.
 * Note: the toolData for SUVPeak tool extends the toolData for EllipticalRoiTool, but
 * adds the secondaryData which is related to the data for the 1cc sphere.
 * @public
 * @class SUVPeakTool
 * @memberof Tools
 * @classdesc Tool for performing SUV Peak Calculation
 * @extends Tools.Base.BaseAnnotationTool
 */
export default class SUVPeakTool extends EllipticalRoiTool {
  editData: {
    toolData: any
    viewportUIDsToRender: string[]
    handleIndex?: number
    movingTextBox: boolean
    newAnnotation?: boolean
    hasMoved?: boolean
    canvasWidth?: number
    canvasHeight?: number
    centerCanvas?: Array<number>
    originalHandleCanvas?: Array<number>
  } | null
  _configuration: any
  isDrawing: boolean
  isHandleOutsideImage: boolean

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'ptSUVPeak',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        strategies: {
          SUV_PEAK: suvPeakStrategy,
        },
        defaultStrategy: 'SUV_PEAK',
        activeStrategy: 'SUV_PEAK',
        shadow: true,
        preventHandleOutsideImage: false,
      },
    })
  }

  addNewMeasurement = (evt: CustomEvent): SUVPeakSpecificToolData => {
    const eventData = evt.detail
    const { currentPoints, element } = eventData
    const worldPos = currentPoints.world
    const canvasPos = currentPoints.canvas

    const enabledElement = getEnabledElement(element)
    const { viewport, renderingEngine } = enabledElement

    this.isDrawing = true

    const camera = viewport.getCamera()
    const { viewPlaneNormal, viewUp } = camera

    const toolData = {
      metadata: {
        viewPlaneNormal: <Point3>[...viewPlaneNormal],
        viewUp: <Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId: '',
        toolName: this.name,
      },
      data: {
        invalidated: true,
        handles: {
          center: {
            world: worldPos,
            canvas: canvasPos,
          },
          radius: 1,
          points: [
            [...worldPos],
            [...worldPos],
            [...worldPos],
            [...worldPos],
          ] as [Point3, Point3, Point3, Point3],
          activeHandleIndex: null,
        },
        isDrawing: true,
        cachedStats: {},
        active: true,
      },
      secondaryData: {
        handles: {
          points: [
            [-Infinity, -Infinity, -Infinity],
            [-Infinity, -Infinity, -Infinity],
            [-Infinity, -Infinity, -Infinity],
            [-Infinity, -Infinity, -Infinity],
          ] as [Point3, Point3, Point3, Point3],
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
        cachedStats: {
          suvPeakValue: 0,
          suvMax: 0,
        },
      },
    }

    addToolState(element, toolData)

    const viewportUIDsToRender = [viewport.uid]

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

  /**
   * @virtual @method Event handler for MOUSE_MOVE event.
   *
   *
   * @param {CustomEvent} evt - The event.
   * @param {ToolSpecificToolState} filteredToolState The toolState to check for hover interactions
   * @returns {boolean} - True if the image needs to be updated.
   */
  public mouseMoveCallback = (evt, filteredToolState): boolean => {
    const { element, currentPoints } = evt.detail
    const canvasCoords = currentPoints.canvas
    let annotationsNeedToBeRedrawn = false

    for (let i = 0; i < filteredToolState.length; i++) {
      const toolData = filteredToolState[i]
      const { data } = toolData
      const activateHandleIndex = data.handles
        ? data.handles.activeHandleIndex
        : undefined

      const near = this._imagePointNearToolOrHandle(
        element,
        toolData,
        canvasCoords,
        6
      )

      const nearToolAndNotMarkedActive = near && !data.active
      const notNearToolAndMarkedActive = !near && data.active
      if (nearToolAndNotMarkedActive || notNearToolAndMarkedActive) {
        data.active = !data.active
        annotationsNeedToBeRedrawn = true
      } else if (
        data.handles &&
        data.handles.activeHandleIndex !== activateHandleIndex
      ) {
        // Active handle index has changed, re-render.
        annotationsNeedToBeRedrawn = true
      }
    }

    return annotationsNeedToBeRedrawn
  }

  getHandleNearImagePoint = (element, toolData, canvasCoords, proximity) => {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    const { data, secondaryData } = toolData
    const { points } = data.handles
    const { textBox } = secondaryData.handles
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
        vec2.distance(canvasCoords, <vec2>toolDataCanvasCoordinate) < proximity

      if (near === true) {
        data.handles.activeHandleIndex = i
        return point
      }
    }

    data.handles.activeHandleIndex = null
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

    let centerCanvas
    let canvasWidth
    let canvasHeight
    let originalHandleCanvas

    // If handle is textBox
    if (handle.worldPosition) {
      movingTextBox = true
    } else {
      // If handle is not textBox but svg annotation handles
      const { points } = data.handles
      const enabledElement = getEnabledElement(element)
      const { worldToCanvas } = enabledElement.viewport

      handleIndex = points.findIndex((p) => p === handle)

      const pointsCanvas = points.map(worldToCanvas)

      originalHandleCanvas = pointsCanvas[handleIndex]

      canvasWidth = Math.abs(pointsCanvas[2][0] - pointsCanvas[3][0])
      canvasHeight = Math.abs(pointsCanvas[0][1] - pointsCanvas[1][1])

      centerCanvas = [
        (pointsCanvas[2][0] + pointsCanvas[3][0]) / 2,
        (pointsCanvas[0][1] + pointsCanvas[1][1]) / 2,
      ]
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
      canvasWidth,
      canvasHeight,
      centerCanvas,
      originalHandleCanvas,
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

  pointNearTool = (element, toolData, canvasCoords, proximity) => {
    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    const { data } = toolData
    const { points } = data.handles

    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))
    const canvasCorners = getCanvasEllipseCorners(canvasCoordinates)

    const [canvasPoint1, canvasPoint2] = canvasCorners

    const minorEllipse = {
      left: Math.min(canvasPoint1[0], canvasPoint2[0]) + proximity / 2,
      top: Math.min(canvasPoint1[1], canvasPoint2[1]) + proximity / 2,
      width: Math.abs(canvasPoint1[0] - canvasPoint2[0]) - proximity,
      height: Math.abs(canvasPoint1[1] - canvasPoint2[1]) - proximity,
    }

    const majorEllipse = {
      left: Math.min(canvasPoint1[0], canvasPoint2[0]) - proximity / 2,
      top: Math.min(canvasPoint1[1], canvasPoint2[1]) - proximity / 2,
      width: Math.abs(canvasPoint1[0] - canvasPoint2[0]) + proximity,
      height: Math.abs(canvasPoint1[1] - canvasPoint2[1]) + proximity,
    }

    const pointInMinorEllipse = pointInEllipse(minorEllipse, canvasCoords)
    const pointInMajorEllipse = pointInEllipse(majorEllipse, canvasCoords)

    if (pointInMajorEllipse && !pointInMinorEllipse) {
      return true
    }
  }

  _mouseDragCallback = (evt) => {
    this.isDrawing = true
    const eventData = evt.detail
    const { element } = eventData
    const { currentPoints } = eventData
    const currentCanvasPoints = currentPoints.canvas
    const enabledElement = getEnabledElement(element)
    const { renderingEngine, viewport } = enabledElement
    const { canvasToWorld } = viewport

    //////
    const { toolData, viewportUIDsToRender } = this.editData
    const { data } = toolData
    const { center } = data.handles

    // Center of circle in canvas Coordinates
    const { canvas: centerCanvas } = center

    const dX = Math.abs(currentCanvasPoints[0] - centerCanvas[0])
    const dY = Math.abs(currentCanvasPoints[1] - centerCanvas[1])
    const radius = Math.sqrt(dX * dX + dY * dY)

    const bottomCanvas = [centerCanvas[0], centerCanvas[1] + radius]
    const topCanvas = [centerCanvas[0], centerCanvas[1] - radius]
    const leftCanvas = [centerCanvas[0] - radius, centerCanvas[1]]
    const rightCanvas = [centerCanvas[0] + radius, centerCanvas[1]]

    data.handles.points = [
      canvasToWorld(bottomCanvas),
      canvasToWorld(topCanvas),
      canvasToWorld(leftCanvas),
      canvasToWorld(rightCanvas),
    ]

    data.invalidated = true

    this.editData.hasMoved = true

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )
  }

  _mouseDragModifyCallback = (evt) => {
    this.isDrawing = true
    const eventData = evt.detail
    const { element } = eventData

    const { toolData, viewportUIDsToRender, handleIndex, movingTextBox } =
      this.editData
    const { data, secondaryData } = toolData

    if (movingTextBox) {
      const { deltaPoints } = eventData
      const worldPosDelta = deltaPoints.world

      const { textBox } = secondaryData.handles
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
      this._dragHandle(evt)
      data.invalidated = true
    }

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )
  }

  _dragHandle = (evt) => {
    const eventData = evt.detail
    const { element } = eventData
    const enabledElement = getEnabledElement(element)
    const { canvasToWorld } = enabledElement.viewport

    const {
      toolData,
      canvasWidth,
      canvasHeight,
      handleIndex,
      centerCanvas,
      originalHandleCanvas,
    } = this.editData
    const { data } = toolData
    const { points } = data.handles

    // Move current point in that direction.
    // Move other points in oposite direction.

    const { currentPoints } = eventData
    const currentCanvasPoints = currentPoints.canvas

    const dX = Math.abs(currentCanvasPoints[0] - centerCanvas[0])
    const dY = Math.abs(currentCanvasPoints[1] - centerCanvas[1])
    const radius = Math.sqrt(dX * dX + dY * dY)
    const bottomCanvas = [centerCanvas[0], centerCanvas[1] + radius]
    const topCanvas = [centerCanvas[0], centerCanvas[1] - radius]
    const leftCanvas = [centerCanvas[0] - radius, centerCanvas[1]]
    const rightCanvas = [centerCanvas[0] + radius, centerCanvas[1]]

    data.handles.points = [
      canvasToWorld(bottomCanvas),
      canvasToWorld(topCanvas),
      canvasToWorld(leftCanvas),
      canvasToWorld(rightCanvas),
    ]
  }

  _mouseUpCallback = (evt) => {
    const eventData = evt.detail
    const { element } = eventData

    const { toolData, newAnnotation, viewportUIDsToRender, hasMoved } =
      this.editData
    const { data } = toolData
    const {
      viewPlaneNormal,
      viewUp,
    }: { viewPlaneNormal: Point3; viewUp: Point3 } = toolData.metadata

    if (newAnnotation && !hasMoved) {
      return
    }

    data.active = false
    data.handles.activeHandleIndex = null

    delete data.isDrawing

    this._deactivateModify(element)
    this._deactivateDraw(element)

    resetElementCursor(element)

    const enabledElement = getEnabledElement(element)
    const { viewport, renderingEngine } = enabledElement

    this.editData = null
    this.isDrawing = false

    if (viewport instanceof StackViewport) {
      throw new Error('Not implemented yet')
    }

    // Todo: should this be inside the constructor?
    const volume = getVolume(this.configuration.volumeUID)
    const operationData = {
      points: data.handles.points,
      viewPlaneNormal,
      viewUp,
      volume: volume,
    }

    const eventDetail = {
      canvas: element,
      enabledElement,
      renderingEngine,
    }

    const [bottomWorld, topWorld, suvPeakValue, suvMax] =
      this.applyActiveStrategy(eventDetail, operationData)

    toolData.secondaryData.handles.points = [bottomWorld, topWorld]
    toolData.secondaryData.cachedStats.suvPeakValue = suvPeakValue
    toolData.secondaryData.cachedStats.suvMax = suvMax

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )
  }

  /**
   * Add event handlers for the modify event loop, and prevent default event propagation.
   */
  _activateDraw = (element) => {
    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _deactivateDraw = (element) => {
    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.removeEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  _activateModify = (element) => {
    state.isInteractingWithTool = true

    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragModifyCallback)
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragModifyCallback)
  }

  _deactivateModify = (element) => {
    state.isInteractingWithTool = false

    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(
      EVENTS.MOUSE_DRAG,
      this._mouseDragModifyCallback
    )
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.removeEventListener(
      EVENTS.TOUCH_DRAG,
      this._mouseDragModifyCallback
    )
  }

  /**
   * getToolState = Custom getToolStateMethod with filtering.
   * @param element
   */
  fillPrimaryAndSecondaryToolStateForElement = (element, toolState) => {
    if (!toolState || !toolState.length) {
      return
    }

    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement
    const primaryToolState = getToolStateForDisplay(viewport, toolState)

    let secondaryToolState = cloneDeep(toolState)
    secondaryToolState = secondaryToolState.map((toolData) => {
      const newToolData = toolData
      toolData.data = toolData.secondaryData
      return newToolData
    })

    secondaryToolState = getToolStateForDisplay(viewport, secondaryToolState)

    return [primaryToolState, secondaryToolState]
  }

  renderToolData(evt: CustomEvent, svgDrawingHelper: any): void {
    const { enabledElement } = svgDrawingHelper
    const { viewport } = enabledElement

    const eventData = evt.detail
    const { element } = eventData

    const toolState = getToolState(svgDrawingHelper.enabledElement, this.name)

    if (!toolState?.length) {
      return
    }

    const [primaryToolState, secondaryToolState] =
      this.fillPrimaryAndSecondaryToolStateForElement(element, toolState)

    if (!primaryToolState?.length && !secondaryToolState.length) {
      return
    }

    if (viewport instanceof StackViewport) {
      throw new Error('Stack viewport is not supported')
    }

    // For primary sphere (circle representation)
    for (let i = 0; i < primaryToolState.length; i++) {
      const toolData = primaryToolState[i]

      const toolMetadata = toolData.metadata
      const annotationUID = toolMetadata.toolDataUID

      const data = toolData.data
      const { points, activeHandleIndex } = data.handles

      // [bottom, top, left, right]
      const canvasCoordinates = points.map((p) =>
        viewport.worldToCanvas(p)
      ) as [Point2, Point2]

      const bottom = canvasCoordinates[0]
      const top = canvasCoordinates[1]

      const center = [
        Math.floor((bottom[0] + top[0]) / 2),
        Math.floor((bottom[1] + top[1]) / 2),
      ]

      const radiusToUse = Math.floor(bottom[1] - (bottom[1] + top[1]) / 2)

      const color = 'red'

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

      const circleUID = '0'
      drawCircleSvg(
        svgDrawingHelper,
        this.name,
        annotationUID,
        circleUID,
        center,
        radiusToUse,
        {
          color,
        }
      )
    }

    if (!secondaryToolState.length) {
      return
    }

    // For secondary sphere (dashed circle representation)
    for (let i = 0; i < secondaryToolState.length; i++) {
      const toolData = secondaryToolState[i]
      const settings = Settings.getObjectSettings(toolData, SUVPeakTool)

      const toolMetadata = toolData.metadata
      const annotationUID = toolMetadata.toolDataUID

      const data = toolData.data
      const { suvPeakValue, suvMax } = data.cachedStats
      const { points } = data.handles
      // console.debug(points)
      // const { canvas, world } = center

      const canvasCoordinates = points.map((p) =>
        viewport.worldToCanvas(p)
      ) as [Point2, Point2]

      const bottom = canvasCoordinates[0]
      const top = canvasCoordinates[1]

      // center
      const center = [
        Math.floor((bottom[0] + top[0]) / 2),
        Math.floor((bottom[1] + top[1]) / 2),
      ] as Point2

      const radiusToUse = Math.floor(bottom[1] - (bottom[1] + top[1]) / 2)
      const color = 'blue'

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed')
        return
      }

      const circleUID = '1'
      drawCircleSvg(
        svgDrawingHelper,
        this.name,
        annotationUID,
        circleUID,
        center,
        radiusToUse,
        {
          color,
        }
      )

      const textLines = [
        `SUV Peak: ${suvPeakValue.toFixed(2)}`,
        `SUV Max: ${suvMax.toFixed(2)}`,
      ]
      if (!textLines || textLines.length === 0) {
        continue
      }

      const canvasTextBoxCoords = getTextBoxCoordsCanvas(canvasCoordinates)

      data.handles.textBox.worldPosition =
        viewport.canvasToWorld(canvasTextBoxCoords)

      // Poor man's cached?
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
          color: 'blue',
        }
      )

      const {
        x: bbLeft,
        y: bbTop,
        width: bbWidth,
        height: bbHeight,
      } = boundingBox

      data.handles.textBox.worldBoundingBox = {
        topLeft: viewport.canvasToWorld([bbLeft, bbTop]),
        topRight: viewport.canvasToWorld([bbLeft + bbWidth, bbTop]),
        bottomLeft: viewport.canvasToWorld([bbLeft, bbTop + bbHeight]),
        bottomRight: viewport.canvasToWorld([
          bbLeft + bbWidth,
          bbTop + bbHeight,
        ]),
      }
    }
  }
}
