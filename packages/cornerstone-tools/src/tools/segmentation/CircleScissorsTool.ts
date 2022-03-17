import {
  cache,
  getEnabledElement,
  StackViewport,
} from '@precisionmetrics/cornerstone-render'
import type { Types } from '@precisionmetrics/cornerstone-render'

import { BaseTool } from '../base'
import { PublicToolProps, ToolProps, EventTypes } from '../../types'

import { fillInsideCircle } from './strategies/fillCircle'
import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import { drawCircle as drawCircleSvg } from '../../drawingSvg'
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor'

import triggerAnnotationRenderForViewportUIDs from '../../utilities/triggerAnnotationRenderForViewportUIDs'
import {
  segmentationColorController,
  lockedSegmentController,
  segmentIndexController,
  activeSegmentationController,
} from '../../store/SegmentationModule'

// Todo
// Define type for annotation

/**
 * @public
 * @class CircleScissorsTool
 * @memberof Tools
 * @classdesc Tool for manipulating segmentation data by drawing a rectangle.
 * @extends Tools.Base.BaseTool
 */
export default class CircleScissorsTool extends BaseTool {
  static toolName = 'CircleScissor'
  editData: {
    annotation: any
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

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        strategies: {
          FILL_INSIDE: fillInsideCircle,
          // ERASE_INSIDE: eraseInsideCircle,
        },
        defaultStrategy: 'FILL_INSIDE',
        activeStrategy: 'FILL_INSIDE',
      },
    }
  ) {
    super(toolProps, defaultToolProps)
  }

  /**
   * Based on the current position of the mouse and the enabledElement, it
   * finds the active segmentation info and use it for the current tool.
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (evt: EventTypes.MouseDownActivateEventType) => {
    const eventDetail = evt.detail
    const { currentPoints, element } = eventDetail
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
      lockedSegmentController.getSegmentsLockedForSegmentation(volumeUID)
    const segmentColor = segmentationColorController.getColorForSegmentIndex(
      toolGroupUID,
      activeSegmentationInfo.segmentationDataUID,
      segmentIndex
    )

    const segmentation = cache.getVolume(volumeUID)

    // Todo: Used for drawing the svg only, we might not need it at all
    const annotation = {
      invalidated: true,
      highlighted: true,
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId: '',
        toolName: CircleScissorsTool.toolName,
        segmentColor,
      },
      data: {
        handles: {
          points: [[...worldPos], [...worldPos], [...worldPos], [...worldPos]],
          activeHandleIndex: null,
        },
        isDrawing: true,
        cachedStats: {},
      },
    }

    const viewportUIDsToRender = [viewport.uid]

    this.editData = {
      annotation,
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

  _mouseDragCallback = (evt: EventTypes.MouseDragEventType) => {
    this.isDrawing = true
    const eventDetail = evt.detail
    const { element } = eventDetail
    const { currentPoints } = eventDetail
    const currentCanvasPoints = currentPoints.canvas
    const enabledElement = getEnabledElement(element)
    const { renderingEngine, viewport } = enabledElement
    const { canvasToWorld } = viewport

    //////
    const { annotation, viewportUIDsToRender, centerCanvas } = this.editData
    const { data } = annotation

    // Center of circle in canvas Coordinates

    const dX = Math.abs(currentCanvasPoints[0] - centerCanvas[0])
    const dY = Math.abs(currentCanvasPoints[1] - centerCanvas[1])
    const radius = Math.sqrt(dX * dX + dY * dY)

    const bottomCanvas: Types.Point2 = [
      centerCanvas[0],
      centerCanvas[1] + radius,
    ]
    const topCanvas: Types.Point2 = [centerCanvas[0], centerCanvas[1] - radius]
    const leftCanvas: Types.Point2 = [centerCanvas[0] - radius, centerCanvas[1]]
    const rightCanvas: Types.Point2 = [
      centerCanvas[0] + radius,
      centerCanvas[1],
    ]

    data.handles.points = [
      canvasToWorld(bottomCanvas),
      canvasToWorld(topCanvas),
      canvasToWorld(leftCanvas),
      canvasToWorld(rightCanvas),
    ]

    annotation.invalidated = true

    this.editData.hasMoved = true

    triggerAnnotationRenderForViewportUIDs(
      renderingEngine,
      viewportUIDsToRender
    )
  }

  _mouseUpCallback = (
    evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
  ) => {
    const eventDetail = evt.detail
    const { element } = eventDetail

    const {
      annotation,
      newAnnotation,
      hasMoved,
      segmentation,
      segmentIndex,
      segmentsLocked,
      segmentationDataUID,
    } = this.editData
    const { data } = annotation
    const { viewPlaneNormal, viewUp } = annotation.metadata

    if (newAnnotation && !hasMoved) {
      return
    }

    annotation.highlighted = false
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

    // element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    // element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _deactivateDraw = (element) => {
    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback)
    element.removeEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback)
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback)

    // element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback)
    // element.removeEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback)
  }

  /**
   * it is used to draw the circleScissor annotation in each
   * request animation frame. Note that the annotation are disappeared
   * after the segmentation modification.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any
  ): void => {
    if (!this.editData) {
      return
    }

    const { viewport } = enabledElement
    const { viewportUIDsToRender } = this.editData

    if (!viewportUIDsToRender.includes(viewport.uid)) {
      return
    }

    const { annotation } = this.editData

    // Todo: rectangle color based on segment index
    const toolMetadata = annotation.metadata
    const annotationUID = annotation.annotationUID

    const data = annotation.data
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
      CircleScissorsTool.toolName,
      annotationUID,
      circleUID,
      center as Types.Point2,
      radius,
      {
        color,
      }
    )
  }
}
