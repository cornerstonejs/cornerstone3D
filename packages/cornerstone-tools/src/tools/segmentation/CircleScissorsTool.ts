import {
  cache,
  getEnabledElement,
  StackViewport,
} from '@precisionmetrics/cornerstone-render'
import { BaseTool } from '../base'
import { Point3 } from '../../types'

import { fillInsideCircle } from './strategies/fillCircle'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import { drawCircle as drawCircleSvg } from '../../drawingSvg'
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor'

import triggerAnnotationRenderForViewportUIDs from '../../util/triggerAnnotationRenderForViewportUIDs'
import {
  segmentationColorController,
  lockedSegmentController,
  segmentIndexController,
  activeSegmentationController,
} from '../../store/SegmentationModule'

// Todo
// Define type for toolData

/**
 * @public
 * @class CircleScissorsTool
 * @memberof Tools
 * @classdesc Tool for manipulating segmentation data by drawing a rectangle.
 * @extends Tools.Base.BaseTool
 */
export default class CircleScissorsTool extends BaseTool {
  editData: {
    toolData: any
    segmentation: any
    segmentIndex: number
    segmentationDataUID: string
    segmentsLocked: number[]
    segmentColor: [number, number, number, number]
    viewportUIDsToRender: string[]
    handleIndex?: number
    movingTextBox: boolean
    newAnnotation?: boolean
    hasMoved?: boolean
    centerCanvas?: Array<number>
  } | null
  _configuration: any
  isDrawing: boolean
  isHandleOutsideImage: boolean

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'CircleScissor',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        strategies: {
          FILL_INSIDE: fillInsideCircle,
          // ERASE_INSIDE: eraseInsideCircle,
        },
        defaultStrategy: 'FILL_INSIDE',
        activeStrategy: 'FILL_INSIDE',
      },
    })
  }

  addNewMeasurement = async (evt) => {
    const eventData = evt.detail
    const { currentPoints, element } = eventData
    const worldPos = currentPoints.world
    const canvasPos = currentPoints.canvas

    const enabledElement = getEnabledElement(element)
    const { viewport, renderingEngine } = enabledElement

    this.isDrawing = true

    const camera = viewport.getCamera()
    const { viewPlaneNormal, viewUp } = camera
    const toolGroupUID = this.toolGroupUID

    const activeSegmentationInfo =
      activeSegmentationController.getActiveSegmentationInfo(toolGroupUID)
    if (!activeSegmentationInfo) {
      throw new Error(
        'No active segmentation detected, create one before using scissors tool'
      )
    }

    const { volumeUID, segmentationDataUID } = activeSegmentationInfo
    const segmentIndex =
      segmentIndexController.getActiveSegmentIndex(toolGroupUID)
    const segmentsLocked =
      lockedSegmentController.getLockedSegmentsForSegmentation(volumeUID)
    const segmentColor = segmentationColorController.getColorForSegmentIndex(
      toolGroupUID,
      activeSegmentationInfo.segmentationDataUID,
      segmentIndex
    )

    const segmentation = cache.getVolume(volumeUID)

    // Todo: Used for drawing the svg only, we might not need it at all
    const toolData = {
      metadata: {
        viewPlaneNormal: <Point3>[...viewPlaneNormal],
        viewUp: <Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId: '',
        toolName: this.name,
        segmentColor,
      },
      data: {
        invalidated: true,
        handles: {
          points: [[...worldPos], [...worldPos], [...worldPos], [...worldPos]],
          activeHandleIndex: null,
        },
        isDrawing: true,
        cachedStats: {},
        active: true,
      },
    }

    const viewportUIDsToRender = [viewport.uid]

    this.editData = {
      toolData,
      segmentation,
      centerCanvas: canvasPos,
      segmentIndex,
      segmentationDataUID,
      segmentsLocked,
      segmentColor,
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
    const { toolData, viewportUIDsToRender, centerCanvas } = this.editData
    const { data } = toolData

    // Center of circle in canvas Coordinates

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

  _mouseUpCallback = (evt) => {
    const eventData = evt.detail
    const { element } = eventData

    const {
      toolData,
      newAnnotation,
      hasMoved,
      segmentation,
      segmentIndex,
      segmentsLocked,
      segmentationDataUID,
    } = this.editData
    const { data } = toolData
    const { viewPlaneNormal, viewUp } = toolData.metadata

    if (newAnnotation && !hasMoved) {
      return
    }

    data.active = false
    data.handles.activeHandleIndex = null

    this._deactivateDraw(element)

    resetElementCursor(element)

    const enabledElement = getEnabledElement(element)
    const { viewport } = enabledElement

    this.editData = null
    this.isDrawing = false

    if (viewport instanceof StackViewport) {
      throw new Error('Not implemented yet')
    }

    const operationData = {
      points: data.handles.points,
      volume: segmentation,
      segmentIndex,
      segmentsLocked,
      viewPlaneNormal,
      toolGroupUID: this.toolGroupUID,
      segmentationDataUID,
      viewUp,
    }

    this.applyActiveStrategy(enabledElement, operationData)
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

  renderToolData(evt: CustomEvent, svgDrawingHelper: any): void {
    if (!this.editData) {
      return
    }

    const { enabledElement } = svgDrawingHelper
    const { viewport } = enabledElement
    const { viewportUIDsToRender } = this.editData

    if (!viewportUIDsToRender.includes(viewport.uid)) {
      return
    }

    const { toolData } = this.editData

    // Todo: rectangle colro based on segment index
    const toolMetadata = toolData.metadata
    const annotationUID = toolMetadata.toolDataUID

    const data = toolData.data
    const { points } = data.handles
    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))

    const bottom = canvasCoordinates[0]
    const top = canvasCoordinates[1]

    const center = [
      Math.floor((bottom[0] + top[0]) / 2),
      Math.floor((bottom[1] + top[1]) / 2),
    ]

    const radius = Math.abs(bottom[1] - Math.floor((bottom[1] + top[1]) / 2))

    const color = `rgb(${toolMetadata.segmentColor.slice(0, 3)})`

    // If rendering engine has been destroyed while rendering
    if (!viewport.getRenderingEngine()) {
      console.warn('Rendering Engine has been destroyed')
      return
    }

    const circleUID = '0'
    drawCircleSvg(
      svgDrawingHelper,
      this.name,
      annotationUID,
      circleUID,
      center,
      radius,
      {
        color,
      }
    )
  }
}
