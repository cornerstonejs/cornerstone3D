import {
  cache,
  getEnabledElement,
  Settings,
  StackViewport,
} from '@precisionmetrics/cornerstone-render'
import type { Types } from '@precisionmetrics/cornerstone-render'

import { BaseTool } from '../base'
import { PublicToolProps, ToolProps, EventTypes } from '../../types'
import { fillInsideRectangle } from './strategies/fillRectangle'
import { eraseInsideRectangle } from './strategies/eraseRectangle'
import { getViewportUIDsWithToolToRender } from '../../util/viewportFilters'

import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import RectangleRoiTool from '../annotation/RectangleRoiTool'
import { drawRect as drawRectSvg } from '../../drawingSvg'
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

/**
 * @public
 * @class RectangleScissorsTool
 * @memberof Tools
 * @classdesc Tool for manipulating segmentation data by drawing a rectangle.
 * @extends Tools.Base.BaseTool
 */
export default class RectangleScissorsTool extends BaseTool {
  _throttledCalculateCachedStats: any
  editData: {
    annotation: any
    segmentationDataUID: string
    segmentation: any
    segmentIndex: number
    segmentsLocked: number[]
    segmentColor: [number, number, number, number]
    viewportUIDsToRender: string[]
    handleIndex?: number
    movingTextBox: boolean
    newAnnotation?: boolean
    hasMoved?: boolean
  } | null
  _configuration: any
  isDrawing: boolean
  isHandleOutsideImage: boolean

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      name: 'RectangleScissor',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        strategies: {
          FILL_INSIDE: fillInsideRectangle,
          ERASE_INSIDE: eraseInsideRectangle,
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

    // Todo: we should have representation type check if we are going to use this
    // tool in other representations other than labelmap
    const { segmentationDataUID, volumeUID } = activeSegmentationInfo
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
      highlighted: true,
      invalidated: true,
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId: '',
        toolName: this.name,
        segmentColor,
      },
      data: {
        handles: {
          points: [
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
          ],
          activeHandleIndex: null,
        },
      },
    }

    // Ensure settings are initialized after annotation instantiation
    Settings.getObjectSettings(annotation, RectangleRoiTool)

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    )

    this.editData = {
      annotation,
      segmentation,
      segmentIndex,
      segmentsLocked,
      segmentColor,
      segmentationDataUID,
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

    const { annotation, viewportUIDsToRender, handleIndex } = this.editData
    const { data } = annotation

    // Moving handle.
    const { currentPoints } = eventDetail
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

        bottomLeftCanvas = <Types.Point2>[
          topLeftCanvas[0],
          bottomRightCanvas[1],
        ]
        topRightCanvas = <Types.Point2>[bottomRightCanvas[0], topLeftCanvas[1]]

        bottomLeftWorld = canvasToWorld(bottomLeftCanvas)
        topRightWorld = canvasToWorld(topRightCanvas)

        points[0] = bottomLeftWorld
        points[3] = topRightWorld

        break
    }
    annotation.invalidated = true

    this.editData.hasMoved = true

    const { renderingEngine } = enabledElement

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
      segmentationDataUID,
      segmentIndex,
      segmentsLocked,
    } = this.editData
    const { data } = annotation

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
      segmentationDataUID,
      segmentIndex,
      segmentsLocked,
      toolGroupUID: this.toolGroupUID,
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
   * it is used to draw the rectangleScissor annotation in each
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
    const { annotation } = this.editData

    // Todo: rectangle color based on segment index
    const settings = Settings.getObjectSettings(annotation, RectangleRoiTool)
    const toolMetadata = annotation.metadata
    const annotationUID = annotation.annotationUID

    const data = annotation.data
    const { points } = data.handles
    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p))
    const color = `rgb(${toolMetadata.segmentColor.slice(0, 3)})`

    // If rendering engine has been destroyed while rendering
    if (!viewport.getRenderingEngine()) {
      console.warn('Rendering Engine has been destroyed')
      return
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
      }
    )
  }
}
