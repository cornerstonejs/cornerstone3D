import { BaseAnnotationTool } from '../base'
// ~~ VTK Viewport
import {
  getEnabledElement,
  Settings,
  Types,
  getVolume,
  StackViewport,
  VolumeViewport,
  eventTarget,
  triggerEvent,
} from '@ohif/cornerstone-render'
import { getImageIdForTool, getToolStateForDisplay } from '../../util/planar'
import throttle from '../../util/throttle'
import {
  addToolState,
  getToolState,
  removeToolState,
} from '../../stateManagement/toolState'
import { isToolDataLocked } from '../../stateManagement/toolDataLocking'
import {
  drawEllipse as drawEllipseSvg,
  drawHandles as drawHandlesSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
} from '../../drawingSvg'
import { vec2, vec3 } from 'gl-matrix'
import { state } from '../../store'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import { getViewportUIDsWithToolToRender } from '../../util/viewportFilters'
import { indexWithinDimensions } from '../../util/vtkjs'
import { getTextBoxCoordsCanvas } from '../../util/drawing'
import { pointInEllipse } from '../../util/math/ellipse'
import getWorldWidthAndHeightInPlane from '../../util/planar/getWorldWidthAndHeightInPlane'
import { showToolCursor, hideToolCursor } from '../../store/toolCursor'
import { ToolSpecificToolData } from '../../types'

export default class EllipticalRoiTool extends BaseAnnotationTool {
  touchDragCallback: any
  mouseDragCallback: any
  _throttledCalculateCachedStats: any
  editData: {
    toolData: any
    viewportUIDsToRender: Array<string>
    handleIndex?: number
    movingTextBox?: boolean
    centerCanvas?: Array<number>
    canvasWidth?: number
    canvasHeight?: number
    originalHandleCanvas?: Array<number>
    newAnnotation?: boolean
    hasMoved?: boolean
  } | null
  _configuration: any
  isDrawing: boolean
  isHandleOutsideImage: boolean

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'EllipticalRoi',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: { shadow: true, preventHandleOutsideImage: false },
    })

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStats,
      100,
      { trailing: true }
    )
  }

  addNewMeasurement = (evt: CustomEvent): ToolSpecificToolData => {
    const eventData = evt.detail
    const { currentPoints, element } = eventData
    const worldPos = currentPoints.world
    const canvasPos = currentPoints.canvas

    const enabledElement = getEnabledElement(element)
    const { viewport, FrameOfReferenceUID, renderingEngine } = enabledElement

    if (!FrameOfReferenceUID) {
      console.warn('No FrameOfReferenceUID, empty scene, exiting early.')

      return
    }

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

    const toolData = {
      metadata: {
        viewPlaneNormal: [...viewPlaneNormal],
        viewUp: [...viewUp],
        FrameOfReferenceUID,
        referencedImageId,
        toolName: this.name,
      },
      data: {
        invalidated: true,
        handles: {
          textBox: {
            hasMoved: false,
            worldPosition: [0, 0, 0],
          },
          points: [[...worldPos], [...worldPos], [...worldPos], [...worldPos]],
          activeHandleIndex: null,
        },
        isDrawing: true,
        cachedStats: {},
        active: true,
      },
    } as ToolSpecificToolData

    // Ensure settings are initialized after tool data instantiation
    Settings.getObjectSettings(toolData, EllipticalRoiTool)

    addToolState(element, toolData)

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    )

    this.editData = {
      toolData,
      viewportUIDsToRender,
      centerCanvas: canvasPos,
      newAnnotation: true,
      hasMoved: false,
    }
    this._activateDraw(element)

    hideToolCursor(element)

    evt.preventDefault()

    renderingEngine.renderViewports(viewportUIDsToRender)

    return toolData
  }

  getHandleNearImagePoint = (element, toolData, canvasCoords, proximity) => {
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

    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))
    const canvasCorners = this._getCanvasEllipseCorners(canvasCoordinates)

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

    hideToolCursor(element)

    this._activateModify(element)

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

    let centerCanvas
    let canvasWidth
    let canvasHeight
    let originalHandleCanvas

    if (handle.worldPosition) {
      movingTextBox = true
    } else {
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

    hideToolCursor(element)

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    renderingEngine.renderViewports(viewportUIDsToRender)

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

    delete data.isDrawing
    delete data.isDrawing

    this._deactivateModify(element)
    this._deactivateDraw(element)

    showToolCursor(element)

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

    renderingEngine.renderViewports(viewportUIDsToRender)
  }

  _mouseDragDrawCallback = (evt) => {
    this.isDrawing = true
    const eventData = evt.detail
    const { element } = eventData
    const { currentPoints } = eventData
    const currentCanvasPoints = currentPoints.canvas
    const enabledElement = getEnabledElement(element)
    const { renderingEngine, viewport } = enabledElement
    const { canvasToWorld } = viewport

    //////
    const { toolData, viewportUIDsToRender, centerCanvas } = this.editData
    const { data } = toolData

    const dX = Math.abs(currentCanvasPoints[0] - centerCanvas[0])
    const dY = Math.abs(currentCanvasPoints[1] - centerCanvas[1])

    const bottomCanvas = <Types.Point2>[centerCanvas[0], centerCanvas[1] - dY]
    const topCanvas = <Types.Point2>[centerCanvas[0], centerCanvas[1] + dY]
    const leftCanvas = <Types.Point2>[centerCanvas[0] - dX, centerCanvas[1]]
    const rightCanvas = <Types.Point2>[centerCanvas[0] + dX, centerCanvas[1]]

    data.handles.points = [
      canvasToWorld(bottomCanvas),
      canvasToWorld(topCanvas),
      canvasToWorld(leftCanvas),
      canvasToWorld(rightCanvas),
    ]

    data.invalidated = true

    this.editData.hasMoved = true

    renderingEngine.renderViewports(viewportUIDsToRender)
  }

  _mouseDragModifyCallback = (evt) => {
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
      this._dragHandle(evt)
    }

    data.invalidated = true

    const enabledElement = getEnabledElement(element)
    const { renderingEngine } = enabledElement

    renderingEngine.renderViewports(viewportUIDsToRender)
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

    if (handleIndex === 0 || handleIndex === 1) {
      // Dragging top or bottom point
      const dYCanvas = Math.abs(currentCanvasPoints[1] - centerCanvas[1])
      const canvasBottom = <Types.Point2>[
        centerCanvas[0],
        centerCanvas[1] - dYCanvas,
      ]
      const canvasTop = <Types.Point2>[
        centerCanvas[0],
        centerCanvas[1] + dYCanvas,
      ]

      points[0] = canvasToWorld(canvasBottom)
      points[1] = canvasToWorld(canvasTop)

      const dXCanvas = currentCanvasPoints[0] - originalHandleCanvas[0]
      const newHalfCanvasWidth = canvasWidth / 2 + dXCanvas
      const canvasLeft = <Types.Point2>[
        centerCanvas[0] - newHalfCanvasWidth,
        centerCanvas[1],
      ]
      const canvasRight = <Types.Point2>[
        centerCanvas[0] + newHalfCanvasWidth,
        centerCanvas[1],
      ]

      points[2] = canvasToWorld(canvasLeft)
      points[3] = canvasToWorld(canvasRight)
    } else {
      // Dragging left or right point
      const dXCanvas = Math.abs(currentCanvasPoints[0] - centerCanvas[0])
      const canvasLeft = <Types.Point2>[
        centerCanvas[0] - dXCanvas,
        centerCanvas[1],
      ]
      const canvasRight = <Types.Point2>[
        centerCanvas[0] + dXCanvas,
        centerCanvas[1],
      ]

      points[2] = canvasToWorld(canvasLeft)
      points[3] = canvasToWorld(canvasRight)

      const dYCanvas = currentCanvasPoints[1] - originalHandleCanvas[1]
      const newHalfCanvasHeight = canvasHeight / 2 + dYCanvas
      const canvasBottom = <Types.Point2>[
        centerCanvas[0],
        centerCanvas[1] - newHalfCanvasHeight,
      ]
      const canvasTop = <Types.Point2>[
        centerCanvas[0],
        centerCanvas[1] + newHalfCanvasHeight,
      ]

      points[0] = canvasToWorld(canvasBottom)
      points[1] = canvasToWorld(canvasTop)
    }
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

  _activateModify = (element) => {
    state.isToolLocked = true

    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragModifyCallback)
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragModifyCallback)
  }

  _deactivateModify = (element) => {
    state.isToolLocked = false

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

  _activateDraw = (element) => {
    state.isToolLocked = true

    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragDrawCallback)
    element.addEventListener(EVENTS.MOUSE_MOVE, this._mouseDragDrawCallback)
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragDrawCallback)
  }

  _deactivateDraw = (element) => {
    state.isToolLocked = false

    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(EVENTS.MOUSE_DRAG, this._mouseDragDrawCallback)
    element.removeEventListener(EVENTS.MOUSE_MOVE, this._mouseDragDrawCallback)
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    element.removeEventListener(EVENTS.TOUCH_DRAG, this._mouseDragDrawCallback)
  }

  /**
   * getToolState = Custom getToolStateMethod with filtering.
   * @param element
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
      const toolData = toolState[i]
      const settings = Settings.getObjectSettings(toolData, EllipticalRoiTool)
      const toolMetadata = toolData.metadata
      const annotationUID = toolMetadata.toolUID
      const data = toolData.data

      const { handles, isDrawing } = data
      const { points, activeHandleIndex } = handles

      const lineWidth = this.getStyle(settings, 'lineWidth', toolData)
      const lineDash = this.getStyle(settings, 'lineDash', toolData)
      const color = this.getStyle(settings, 'color', toolData)

      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))
      const canvasCorners = <Array<Types.Point2>>(
        this._getCanvasEllipseCorners(canvasCoordinates)
      )
      if (!data.cachedStats[targetUID]) {
        data.cachedStats[targetUID] = {}
        this._calculateCachedStats(
          toolData,
          viewport,
          renderingEngine,
          enabledElement
        )
      } else if (data.invalidated) {
        this._throttledCalculateCachedStats(
          toolData,
          viewport,
          renderingEngine,
          enabledElement
        )

        // If the invalidated data is as a result of volumeViewport manipulation
        // of the tools, we need to invalidate the related viewports data, so that
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
            const stackTargetUID = this._getTargetStackUID(vp)
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

      const ellipseUID = '0'
      drawEllipseSvg(
        svgDrawingHelper,
        this.name,
        annotationUID,
        ellipseUID,
        canvasCorners[0],
        canvasCorners[1],
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

      // Poor man's cached?
      if (!isDrawing) {
        let canvasTextBoxCoords

        if (!data.handles.textBox.hasMoved) {
          canvasTextBoxCoords = getTextBoxCoordsCanvas(canvasCorners)

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
  }

  _getCanvasEllipseCorners = (canvasCoordinates): Array<Types.Point2> => {
    const [bottom, top, left, right] = canvasCoordinates

    const topLeft = <Types.Point2>[left[0], top[1]]
    const bottomRight = <Types.Point2>[right[0], bottom[1]]

    return [topLeft, bottomRight]
  }

  _getTextLines = (data, targetUID) => {
    const cachedVolumeStats = data.cachedStats[targetUID]
    const { area, mean, stdDev, isEmptyArea, Modality } = cachedVolumeStats

    if (mean === undefined) {
      return
    }

    const textLines = []

    const areaLine = isEmptyArea
      ? `Area: Oblique not supported`
      : `Area: ${area.toFixed(2)} mm${String.fromCharCode(178)}`
    let meanLine = `Mean: ${mean.toFixed(2)}`
    let stdDevLine = `Std Dev: ${stdDev.toFixed(2)}`

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

  _calculateCachedStats = (
    toolData,
    viewport,
    renderingEngine,
    enabledElement
  ) => {
    const data = toolData.data
    const { viewportUID, renderingEngineUID, sceneUID } = enabledElement

    const { points } = data.handles
    const { viewPlaneNormal, viewUp } = viewport.getCamera()

    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))

    const canvasCorners = <Array<Types.Point2>>(
      this._getCanvasEllipseCorners(canvasCoordinates)
    )
    const [canvasPoint1, canvasPoint2] = canvasCorners

    const ellipse = {
      left: Math.min(canvasPoint1[0], canvasPoint2[0]),
      // todo: which top is minimum of y for points?
      top: Math.min(canvasPoint1[1], canvasPoint2[1]),
      width: Math.abs(canvasPoint1[0] - canvasPoint2[0]),
      height: Math.abs(canvasPoint1[1] - canvasPoint2[1]),
    }

    const worldPos1 = viewport.canvasToWorld(canvasPoint1)
    const worldPos2 = viewport.canvasToWorld(canvasPoint2)
    const { cachedStats } = data

    const targetUIDs = Object.keys(cachedStats)

    for (let i = 0; i < targetUIDs.length; i++) {
      const targetUID = targetUIDs[i]

      const { imageVolume } = this._getImageVolumeFromTargetUID(
        targetUID,
        renderingEngine
      )

      const {
        dimensions,
        scalarData,
        vtkImageData: imageData,
        direction,
        metadata,
      } = imageVolume
      const worldPos1Index = vec3.fromValues(0, 0, 0)
      const worldPos2Index = vec3.fromValues(0, 0, 0)

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
        this.isHandleOutsideImage = false
        const iMin = Math.min(worldPos1Index[0], worldPos2Index[0])
        const iMax = Math.max(worldPos1Index[0], worldPos2Index[0])

        const jMin = Math.min(worldPos1Index[1], worldPos2Index[1])
        const jMax = Math.max(worldPos1Index[1], worldPos2Index[1])

        const kMin = Math.min(worldPos1Index[2], worldPos2Index[2])
        const kMax = Math.max(worldPos1Index[2], worldPos2Index[2])

        const { worldWidth, worldHeight } = getWorldWidthAndHeightInPlane(
          viewPlaneNormal,
          viewUp,
          direction,
          worldPos1,
          worldPos2
        )
        const isEmptyArea = worldWidth === 0 && worldHeight === 0
        const area = Math.PI * (worldWidth / 2) * (worldHeight / 2)

        let count = 0
        let mean = 0
        let stdDev = 0

        const yMultiple = dimensions[0]
        const zMultiple = dimensions[0] * dimensions[1]

        // Calling worldToCanvas on voxels all the time is super slow,
        // So we instead work out the change in canvas position incrementing each index causes.
        const start = vec3.fromValues(iMin, jMin, kMin)

        const worldPosStart = vec3.create()
        imageData.indexToWorldVec3(start, worldPosStart)
        const canvasPosStart = viewport.worldToCanvas(worldPosStart)

        const startPlusI = vec3.fromValues(iMin + 1, jMin, kMin)
        const startPlusJ = vec3.fromValues(iMin, jMin + 1, kMin)
        const startPlusK = vec3.fromValues(iMin, jMin, kMin + 1)

        const worldPosStartPlusI = vec3.create()
        const plusICanvasDelta = vec2.create()
        imageData.indexToWorldVec3(startPlusI, worldPosStartPlusI)
        const canvasPosStartPlusI = viewport.worldToCanvas(worldPosStartPlusI)
        vec2.sub(plusICanvasDelta, canvasPosStartPlusI, canvasPosStart)

        const worldPosStartPlusJ = vec3.create()
        const plusJCanvasDelta = vec2.create()
        imageData.indexToWorldVec3(startPlusJ, worldPosStartPlusJ)
        const canvasPosStartPlusJ = viewport.worldToCanvas(worldPosStartPlusJ)
        vec2.sub(plusJCanvasDelta, canvasPosStartPlusJ, canvasPosStart)

        const worldPosStartPlusK = vec3.create()
        const plusKCanvasDelta = vec2.create()
        imageData.indexToWorldVec3(startPlusK, worldPosStartPlusK)
        const canvasPosStartPlusK = viewport.worldToCanvas(worldPosStartPlusK)
        vec2.sub(plusKCanvasDelta, canvasPosStartPlusK, canvasPosStart)

        // This is a triple loop, but one of these 3 values will be constant
        // In the planar view.
        for (let k = kMin; k <= kMax; k++) {
          for (let j = jMin; j <= jMax; j++) {
            for (let i = iMin; i <= iMax; i++) {
              const dI = i - iMin
              const dJ = j - jMin
              const dK = k - kMin

              let canvasCoords = <Types.Point2>[
                canvasPosStart[0],
                canvasPosStart[1],
              ]

              canvasCoords = [
                canvasCoords[0] +
                  plusICanvasDelta[0] * dI +
                  plusJCanvasDelta[0] * dJ +
                  plusKCanvasDelta[0] * dK,
                canvasCoords[1] +
                  plusICanvasDelta[1] * dI +
                  plusJCanvasDelta[1] * dJ +
                  plusKCanvasDelta[1] * dK,
              ]

              if (pointInEllipse(ellipse, canvasCoords)) {
                const value = scalarData[k * zMultiple + j * yMultiple + i]

                count++
                mean += value
              }
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
          isEmptyArea,
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
      sceneUID: sceneUID,
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
